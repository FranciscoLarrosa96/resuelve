import { publicRating } from '../professionals/professional.presenter';
import { fromCents, multiplyCents, toCents } from '../common/money/money';
import type { Quote } from './quote.entity';

export function presentQuote(q: Quote) {
  return {
    id: q.id,
    requestId: q.requestId,
    professionalId: q.professionalId,
    professional: q.professional?.user
      ? {
          id: q.professional.id,
          displayName: `${q.professional.user.firstName} ${q.professional.user.lastName}`,
          avatarUrl: q.professional.user.avatarUrl,
          averageRating: publicRating(q.professional),
          reviewsCount: q.professional.reviewsCount,
        }
      : undefined,
    description: q.description,
    laborAmount: q.laborAmount,
    materialsAmount: q.materialsAmount,
    totalAmount: q.totalAmount,
    currency: 'ARS',
    availableFrom: q.availableFrom,
    validUntil: q.validUntil,
    status: q.status,
    items: (q.items ?? []).map((item) => ({
      id: item.id,
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      subtotal: fromCents(multiplyCents(toCents(item.unitPrice), item.quantity)),
    })),
    createdAt: q.createdAt,
    updatedAt: q.updatedAt,
  };
}
