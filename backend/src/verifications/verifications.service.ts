import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { DataSource, EntityManager, In, QueryFailedError } from 'typeorm';
import { Service } from '../catalog/service.entity';
import { AppException } from '../common/errors/app-exception';
import { ErrorCode } from '../common/errors/error-codes';
import { ProfessionalProfile } from '../professionals/professional-profile.entity';
import { ProfessionalService } from '../professionals/professional-service.entity';
import { ProfessionalVerification } from '../professionals/professional-verification.entity';
import { effectiveVerificationStatus } from '../professionals/professional-rules';
import { VerificationStatus, VerificationType } from '../professionals/professional.enums';
import { ProfessionalsService } from '../professionals/professionals.service';
import { RequestVerificationDto } from '../professionals/dto/professional.dto';
import {
  ALLOWED_DOCUMENT_FORMATS,
  DOCUMENT_STORAGE,
  DocumentStorage,
  MAX_DOCUMENT_BYTES,
  UploadTicket,
  verificationFolder,
} from './document-storage';

/**
 * Envíos de verificación del propio profesional. Nadie se aprueba solo:
 * todo nace PENDING y lo decide un revisor (ver VerificationReviewService).
 */
@Injectable()
export class VerificationsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly professionals: ProfessionalsService,
    @Inject(DOCUMENT_STORAGE) private readonly storage: DocumentStorage,
  ) {}

  /** Firma para subir el documento de una matrícula directo al almacenamiento privado. */
  async uploadTicket(profile: ProfessionalProfile, serviceId: string): Promise<UploadTicket> {
    this.assertStorage();
    await this.assertLicensableService(this.dataSource.manager, profile.id, serviceId);
    await this.assertNoActive(this.dataSource.manager, profile.id, VerificationType.LICENSE, serviceId);
    return this.storage.createUploadTicket(verificationFolder(profile.id));
  }

  async submit(profile: ProfessionalProfile, dto: RequestVerificationDto) {
    if (dto.type !== VerificationType.LICENSE) return this.submitSimple(profile, dto);

    if (!dto.serviceId) throw invalid('Elegí el servicio de la matrícula', ['serviceId']);
    const reference = dto.reference?.trim() ?? '';
    if (reference.length < 2) throw invalid('Ingresá el número o la referencia de la matrícula', ['reference']);
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    if (expiresAt && expiresAt <= new Date()) throw invalid('La fecha de vencimiento ya pasó', ['expiresAt']);
    if (!dto.documentPublicId) throw invalid('Subí el documento de la matrícula', ['documentPublicId']);
    this.assertStorage();
    await this.assertLicensableService(this.dataSource.manager, profile.id, dto.serviceId);

    // Solo documentos de SU carpeta: uno ajeno responde igual que uno inexistente.
    const publicId = dto.documentPublicId;
    if (!publicId.startsWith(`${verificationFolder(profile.id)}/`)) throw AppException.notFound('Documento');
    const repo = this.dataSource.getRepository(ProfessionalVerification);
    if (await repo.existsBy({ documentPublicId: publicId }))
      throw AppException.conflict(ErrorCode.CONFLICT, 'Ese documento ya se usó en otro envío');

    // Tipo y peso REALES según el proveedor (no la extensión que mandó el navegador).
    const stored = await this.storage.inspect(publicId);
    if (!stored) throw AppException.notFound('Documento');
    if (!(ALLOWED_DOCUMENT_FORMATS as readonly string[]).includes(stored.format) || stored.bytes > MAX_DOCUMENT_BYTES) {
      await this.storage.destroy(publicId).catch(() => undefined);
      throw AppException.unprocessable(
        ErrorCode.INVALID_DOCUMENT,
        'El archivo tiene que ser PDF, JPG, PNG o WebP de hasta 10 MB',
        { allowedFormats: ALLOWED_DOCUMENT_FORMATS, maxBytes: MAX_DOCUMENT_BYTES },
      );
    }

    await this.insertExclusive(async (m) => {
      await this.assertNoActive(m, profile.id, VerificationType.LICENSE, dto.serviceId!);
      await m.insert(ProfessionalVerification, {
        professionalId: profile.id,
        type: VerificationType.LICENSE,
        serviceId: dto.serviceId!,
        reference,
        expiresAt,
        status: VerificationStatus.PENDING,
        documentPublicId: stored.publicId,
        documentFormat: stored.format,
        documentBytes: stored.bytes,
      });
    });
    return this.professionals.getOwn(profile.id);
  }

  /** Identidad / teléfono: sin documento todavía (fuera de esta iteración). */
  private async submitSimple(profile: ProfessionalProfile, dto: RequestVerificationDto) {
    if (dto.documentPublicId || dto.expiresAt)
      throw invalid('Este tipo de verificación no admite documento ni vencimiento', ['documentPublicId']);
    await this.insertExclusive(async (m) => {
      await this.assertNoActive(m, profile.id, dto.type, null);
      await m.insert(ProfessionalVerification, {
        professionalId: profile.id,
        type: dto.type,
        serviceId: null,
        reference: dto.reference?.trim() || null,
        status: VerificationStatus.PENDING,
      });
    });
    return this.professionals.getOwn(profile.id);
  }

  /**
   * Una sola verificación activa (PENDING o VERIFIED vigente) por tipo y
   * servicio. Una VERIFIED vencida se persiste como EXPIRED y deja reenviar.
   */
  private async assertNoActive(
    m: EntityManager,
    professionalId: string,
    type: VerificationType,
    serviceId: string | null,
  ): Promise<void> {
    const rows = await m.findBy(ProfessionalVerification, {
      professionalId,
      type,
      status: In([VerificationStatus.PENDING, VerificationStatus.VERIFIED]),
    });
    for (const v of rows.filter((r) => r.serviceId === serviceId)) {
      if (effectiveVerificationStatus(v) === VerificationStatus.EXPIRED) {
        await m.update(ProfessionalVerification, v.id, { status: VerificationStatus.EXPIRED });
        continue;
      }
      throw AppException.conflict(
        ErrorCode.VERIFICATION_ALREADY_ACTIVE,
        v.status === VerificationStatus.PENDING
          ? 'Ya enviaste esta matrícula y está en revisión'
          : 'Esta matrícula ya está verificada',
        { status: v.status },
      );
    }
  }

  /** Solo matrículas de servicios que la requieren y que el profesional ofrece. */
  private async assertLicensableService(m: EntityManager, professionalId: string, serviceId: string): Promise<void> {
    const service = await m.findOneBy(Service, { id: serviceId, active: true });
    if (!service?.requiresLicense) throw invalid('Ese servicio no requiere matrícula', ['serviceId']);
    if (!(await m.existsBy(ProfessionalService, { professionalId, serviceId })))
      throw invalid('Primero agregá ese servicio a tu perfil', ['serviceId']);
  }

  private assertStorage(): void {
    if (!this.storage.configured)
      throw new AppException(
        ErrorCode.UPLOADS_NOT_CONFIGURED,
        'La carga de documentos todavía no está disponible',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
  }

  /** Transacción + índice único parcial: dos envíos simultáneos no quedan ambos activos. */
  private async insertExclusive(work: (m: EntityManager) => Promise<void>): Promise<void> {
    try {
      await this.dataSource.transaction(work);
    } catch (error) {
      if (error instanceof QueryFailedError && (error.driverError as { code?: string }).code === '23505')
        throw AppException.conflict(ErrorCode.VERIFICATION_ALREADY_ACTIVE, 'Ya hay un envío en revisión');
      throw error;
    }
  }
}

function invalid(message: string, fields: string[]): AppException {
  return AppException.unprocessable(ErrorCode.VALIDATION_ERROR, message, { fields });
}
