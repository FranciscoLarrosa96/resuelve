import { publicRating } from '../professionals/professional.presenter';
import { fromCents, multiplyCents, toCents } from '../common/money/money';
import { effectivePlan } from '../plans/plan';
import { PlanTier } from '../professionals/professional.enums';
import type { Quote } from './quote.entity';

/** Portada de un trabajo realizado, para mostrar junto al presupuesto. */
export interface QuoteWorkCover {
  title: string;
  url: string;
}

/** Trabajos con portada que acompañan un presupuesto PRO (máx. 3, del más reciente). */
export const QUOTE_WORK_COVERS = 3;

/**
 * `workCovers`: solo los presupuestos de un PRO vigente muestran portadas de sus trabajos
 * (presentación de PRO); para el resto llega vacío.
 */
export function presentQuote(q: Quote, workCovers: QuoteWorkCover[] = []) {
  const pro = !!q.professional && effectivePlan(q.professional) === PlanTier.PRO;
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
          workCovers: pro ? workCovers.slice(0, QUOTE_WORK_COVERS) : [],
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
