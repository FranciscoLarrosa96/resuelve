import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppException } from '../common/errors/app-exception';
import { ErrorCode } from '../common/errors/error-codes';
import { ProfessionalVerification } from '../professionals/professional-verification.entity';
import { VerificationStatus } from '../professionals/professional.enums';
import { DOCUMENT_STORAGE, DocumentStorage } from './document-storage';

/** Lo que ve el revisor (terminal). Sin URLs persistidas ni datos de contacto. */
export interface ReviewItem {
  id: string;
  type: string;
  status: VerificationStatus;
  professionalId: string;
  professional: string;
  service: string | null;
  reference: string | null;
  submittedAt: Date;
  expiresAt: Date | null;
  reviewedAt: Date | null;
  rejectionReason: string | null;
  document: { format: string | null; bytes: number | null } | null;
}

/** Cuánto dura el link firmado para ver un documento durante la revisión. */
export const REVIEW_LINK_TTL_SECONDS = 10 * 60;

/**
 * Moderación de verificaciones. Solo la usa el CLI `npm run verification:review`:
 * NO hay endpoint HTTP (ni oculto ni con contraseña).
 */
@Injectable()
export class VerificationReviewService {
  constructor(
    private readonly dataSource: DataSource,
    @Inject(DOCUMENT_STORAGE) private readonly storage: DocumentStorage,
  ) {}

  async listPending(): Promise<ReviewItem[]> {
    const rows = await this.repo().find({
      where: { status: VerificationStatus.PENDING },
      relations: { professional: { user: true }, service: true },
      order: { createdAt: 'ASC' },
    });
    return rows.map(toItem);
  }

  async show(id: string): Promise<{ item: ReviewItem; documentUrl: string | null }> {
    const v = await this.find(id);
    const documentUrl =
      v.documentPublicId && !v.documentDeletedAt && v.documentFormat && this.storage.configured
        ? this.storage.signedDownloadUrl({ publicId: v.documentPublicId, format: v.documentFormat }, REVIEW_LINK_TTL_SECONDS)
        : null;
    return { item: toItem(v), documentUrl };
  }

  async approve(id: string, reviewer: string, opts: { expiresAt?: Date | null } = {}): Promise<ReviewItem> {
    const v = await this.findPending(id);
    await this.repo().update(v.id, {
      status: VerificationStatus.VERIFIED,
      reviewedAt: new Date(),
      reviewedBy: reviewer,
      rejectionReason: null,
      ...(opts.expiresAt !== undefined ? { expiresAt: opts.expiresAt } : {}),
    });
    return toItem(await this.find(id));
  }

  async reject(id: string, reviewer: string, reason: string): Promise<ReviewItem> {
    const clean = reason.trim();
    if (clean.length < 5 || clean.length > 300)
      throw AppException.unprocessable(ErrorCode.VALIDATION_ERROR, 'El motivo debe tener entre 5 y 300 caracteres');
    const v = await this.findPending(id);
    await this.repo().update(v.id, {
      status: VerificationStatus.REJECTED,
      reviewedAt: new Date(),
      reviewedBy: reviewer,
      rejectionReason: clean,
    });
    return toItem(await this.find(id));
  }

  /**
   * Borra el archivo privado después de la decisión y conserva la metadata
   * (estado, referencia, fechas). No se puede con una verificación pendiente.
   * TODO(retención): la política de conservación de documentos no está definida.
   */
  async purgeDocument(id: string): Promise<ReviewItem> {
    const v = await this.find(id);
    if (v.status === VerificationStatus.PENDING)
      throw AppException.conflict(ErrorCode.CONFLICT, 'Primero aprobá o rechazá la verificación');
    if (v.documentPublicId && !v.documentDeletedAt) {
      await this.storage.destroy(v.documentPublicId);
      await this.repo().update(v.id, { documentPublicId: null, documentDeletedAt: new Date() });
    }
    return toItem(await this.find(id));
  }

  private repo() {
    return this.dataSource.getRepository(ProfessionalVerification);
  }

  private async find(id: string): Promise<ProfessionalVerification> {
    const v = await this.repo().findOne({
      where: { id },
      relations: { professional: { user: true }, service: true },
    });
    if (!v) throw AppException.notFound('Verificación');
    return v;
  }

  private async findPending(id: string): Promise<ProfessionalVerification> {
    const v = await this.find(id);
    if (v.status !== VerificationStatus.PENDING)
      throw AppException.conflict(ErrorCode.CONFLICT, `La verificación ya está ${v.status}`);
    return v;
  }
}

function toItem(v: ProfessionalVerification): ReviewItem {
  return {
    id: v.id,
    type: v.type,
    status: v.status,
    professionalId: v.professionalId,
    professional: v.professional?.user ? `${v.professional.user.firstName} ${v.professional.user.lastName}` : v.professionalId,
    service: v.service?.name ?? null,
    reference: v.reference,
    submittedAt: v.createdAt,
    expiresAt: v.expiresAt,
    reviewedAt: v.reviewedAt,
    rejectionReason: v.rejectionReason,
    document:
      v.documentPublicId && !v.documentDeletedAt ? { format: v.documentFormat, bytes: v.documentBytes } : null,
  };
}
