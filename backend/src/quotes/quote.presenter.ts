import { publicRating } from '../professionals/professional.presenter';
import { fromCents, multiplyCents, toCents } from '../common/money/money';
import { effectivePlan } from '../plans/plan';
import { PlanTier } from '../professionals/professional.enums';
import { hasValidLicense } from '../professionals/professional-rules';
import { WORK_COVERS_PER_PROFESSIONAL, WorkCover } from '../professionals/work-photos/work-covers';
import type { Quote } from './quote.entity';

/**
 * `workCovers`: solo los presupuestos de un PRO vigente muestran portadas de sus trabajos
 * (presentación de PRO); para el resto llega vacío. Con `serviceId` (el servicio de la
 * solicitud, lista del cliente) dice si tiene matrícula verificada y vigente de ESE servicio
 * (necesita `professional.verifications` cargadas).
 */
export function presentQuote(q: Quote, workCovers: WorkCover[] = [], serviceId?: string) {
  const pro = !!q.professional && effectivePlan(q.professional) !== PlanTier.FREE;
  return {
    id: q.id,
    requestId: q.requestId,
    professionalId: q.professionalId,
    professional: q.professional?.user
      ? {
          id: q.professional.id,
          displayName: `${q.professional.user.firstName} ${q.professional.user.lastName}`,
          avatarUrl: q.professional.avatarUrl ?? q.professional.user.avatarUrl,
          averageRating: publicRating(q.professional),
          reviewsCount: q.professional.reviewsCount,
          invitedReviewsCount: q.professional.invitedReviewsCount ?? 0,
          /** Resuelve PRO vigente (cuenta paga): no es mérito ni verificación. */
          pro,
          workCovers: pro ? workCovers.slice(0, WORK_COVERS_PER_PROFESSIONAL) : [],
          /** Matrícula verificada del servicio pedido (no de cualquier servicio). */
          licenseVerified:
            !!serviceId && !!q.professional.verifications && hasValidLicense(q.professional.verifications, serviceId),
          /** "Suele responder en…" (mediana real; null = pocas respuestas). */
          averageResponseMinutes: q.professional.averageResponseMinutes ?? null,
        }
      : undefined,
    description: q.description,
    note: q.note ?? null,
    estimatedDuration: q.estimatedDuration ?? null,
    laborAmount: q.laborAmount,
    materialsAmount: q.materialsAmount,
    totalAmount: q.totalAmount,
    currency: 'ARS',
    availableFrom: q.availableFrom,
    validUntil: q.validUntil,
    status: q.status,
    items: [...(q.items ?? [])].sort((a, b) => a.sortOrder - b.sortOrder).map((item) => ({
      id: item.id,
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      subtotal: fromCents(multiplyCents(toCents(item.unitPrice), item.quantity)),
      sortOrder: item.sortOrder,
    })),
    createdAt: q.createdAt,
    updatedAt: q.updatedAt,
  };
}
