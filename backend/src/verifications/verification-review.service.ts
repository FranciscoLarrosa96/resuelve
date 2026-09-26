import { Inject, Injectable } from '@nestjs/common';
import { DataSource, Not } from 'typeorm';
import { AppException } from '../common/errors/app-exception';
import { ErrorCode } from '../common/errors/error-codes';
import { ProfessionalVerification } from '../professionals/professional-verification.entity';
import { ProfessionalStatus, VerificationStatus } from '../professionals/professional.enums';
import { DOCUMENT_STORAGE, DocumentStorage } from './document-storage';

/** Lo que ve el revisor (terminal o panel). Sin URLs persistidas ni datos de contacto. */
export interface ReviewItem {
  id: string;
  type: string;
  status: VerificationStatus;
  professionalId: string;
  professional: string;
  /** Si el perfil es visible (ACTIVE); el panel solo enlaza al perfil público en ese caso. */
  professionalActive: boolean;
  service: string | null;
  serviceSlug: string | null;
  reference: string | null;
  submittedAt: Date;
  expiresAt: Date | null;
  reviewedAt: Date | null;
  reviewedBy: string | null;
  rejectionReason: string | null;
  document: { format: string | null; bytes: number | null } | null;
}

/** Envíos anteriores del mismo profesional para el mismo servicio (contexto del revisor). */
export interface ReviewHistoryEntry {
  id: string;
  status: VerificationStatus;
  reference: string | null;
  submittedAt: Date;
  reviewedAt: Date | null;
  rejectionReason: string | null;
}

/** Revisadas que se muestran como máximo (más recientes primero). */
export const REVIEWED_LIST_LIMIT = 30;

/** Cuánto dura el link firmado para ver un documento durante la revisión. */
export const REVIEW_LINK_TTL_SECONDS = 10 * 60;

/**
 * Moderación de verificaciones. La usan el CLI `npm run verification:review` y
 * el panel /admin (AdminGuard: solo usuarios con `is_admin`). Aprobar y rechazar
 * son condicionales sobre PENDING: si dos revisiones compiten, gana la primera.
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

  countPending(): Promise<number> {
    return this.repo().countBy({ status: VerificationStatus.PENDING });
  }

  /** Ya revisadas (aprobadas, rechazadas o vencidas), las más recientes primero. */
  async listReviewed(limit = REVIEWED_LIST_LIMIT): Promise<ReviewItem[]> {
    const rows = await this.repo().find({
      where: { status: Not(VerificationStatus.PENDING) },
      relations: { professional: { user: true }, service: true },
      order: { reviewedAt: { direction: 'DESC', nulls: 'LAST' }, createdAt: 'DESC' },
      take: limit,
    });
    return rows.map(toItem);
  }

  async show(
    id: string,
  ): Promise<{ item: ReviewItem; documentUrl: string | null; history: ReviewHistoryEntry[] }> {
    const v = await this.find(id);
    const documentUrl =
      v.documentPublicId && !v.documentDeletedAt && v.documentFormat && this.storage.configured
        ? this.storage.signedDownloadUrl(
            { publicId: v.documentPublicId, format: v.documentFormat },
            REVIEW_LINK_TTL_SECONDS,
          )
        : null;
    const previous = await this.repo().find({
      where: {
        professionalId: v.professionalId,
        type: v.type,
        ...(v.serviceId ? { serviceId: v.serviceId } : {}),
        id: Not(v.id),
      },
      order: { createdAt: 'DESC' },
      take: 10,
    });
    const history = previous
      .filter((p) => p.serviceId === v.serviceId)
      .map((p) => ({
        id: p.id,
        status: p.status,
        reference: p.reference,
        submittedAt: p.createdAt,
        reviewedAt: p.reviewedAt,
        rejectionReason: p.rejectionReason,
      }));
    return { item: toItem(v), documentUrl, history };
  }

  async approve(id: string, reviewer: string, opts: { expiresAt?: Date | null } = {}): Promise<ReviewItem> {
    if (opts.expiresAt && opts.expiresAt <= new Date())
      throw AppException.unprocessable(ErrorCode.VALIDATION_ERROR, 'La fecha de vencimiento ya pasó', [
        'expiresAt',
      ]);
    await this.decide(id, {
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
      throw AppException.unprocessable(
        ErrorCode.VALIDATION_ERROR,
        'El motivo debe tener entre 5 y 300 caracteres',
        ['reason'],
      );
    await this.decide(id, {
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

  /**
   * UPDATE … WHERE status = 'PENDING': la base decide. Si otra pestaña (o el
   * CLI) ya la revisó, no se pisa la decisión y se responde 409.
   */
  private async decide(id: string, changes: Partial<ProfessionalVerification>): Promise<void> {
    const v = await this.find(id);
    if (v.status === VerificationStatus.PENDING) {
      const result = await this.repo().update({ id: v.id, status: VerificationStatus.PENDING }, changes);
      if (result.affected) return;
    }
    const current = await this.find(id);
    throw AppException.conflict(
      ErrorCode.VERIFICATION_ALREADY_REVIEWED,
      `La verificación ya está ${current.status}`,
      {
        status: current.status,
      },
    );
  }
}

function toItem(v: ProfessionalVerification): ReviewItem {
  return {
    id: v.id,
    type: v.type,
    status: v.status,
    professionalId: v.professionalId,
    professional: v.professional?.user
      ? `${v.professional.user.firstName} ${v.professional.user.lastName}`
      : v.professionalId,
    professionalActive: v.professional?.status === ProfessionalStatus.ACTIVE,
    service: v.service?.name ?? null,
    serviceSlug: v.service?.slug ?? null,
    reference: v.reference,
    submittedAt: v.createdAt,
    expiresAt: v.expiresAt,
    reviewedAt: v.reviewedAt,
    reviewedBy: v.reviewedBy,
    rejectionReason: v.rejectionReason,
    document:
      v.documentPublicId && !v.documentDeletedAt
        ? { format: v.documentFormat, bytes: v.documentBytes }
        : null,
  };
}
