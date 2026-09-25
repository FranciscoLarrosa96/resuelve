export enum QuoteStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
  WITHDRAWN = 'WITHDRAWN',
  EXPIRED = 'EXPIRED',
}

/** Estados "activos": a lo sumo uno por profesional y solicitud (índice único parcial). */
export const ACTIVE_QUOTE_STATUSES = [QuoteStatus.PENDING, QuoteStatus.ACCEPTED] as const;
