import { RequestProfessional } from './request';

/**
 * Presupuestos reales (quote.presenter.ts del backend). Los montos llegan
 * como string decimal ("29001.00", numeric(12,2)): el total lo calcula
 * SIEMPRE el servidor y el frontend solo lo muestra.
 */

export type QuoteStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'WITHDRAWN' | 'EXPIRED';

export interface QuoteItem {
  id: string;
  description: string;
  quantity: string;
  unitPrice: string;
  subtotal: string;
}

export interface Quote {
  id: string;
  requestId: string;
  professionalId: string;
  professional?: RequestProfessional;
  description: string;
  laborAmount: string;
  materialsAmount: string;
  totalAmount: string;
  currency: 'ARS';
  availableFrom: string | null;
  validUntil: string | null;
  status: QuoteStatus;
  items: QuoteItem[];
  createdAt: string;
  updatedAt: string;
}

export interface QuoteItemPayload {
  description: string;
  quantity: number;
  unitPrice: number;
}

/**
 * POST /pro/requests/:id/quote (CreateQuoteDto). No existe `totalAmount`:
 * si se enviara, el backend lo rechaza. Con `items`, los materiales son la
 * suma de ítems y `materialsAmount` no se manda.
 */
export interface CreateQuotePayload {
  description: string;
  laborAmount: number;
  materialsAmount?: number;
  items?: QuoteItemPayload[];
  availableFrom?: string;
  validUntil?: string;
}

/** Límites del CreateQuoteDto. */
export const QUOTE_LIMITS = {
  descriptionMin: 5,
  descriptionMax: 2000,
  itemDescriptionMin: 2,
  itemDescriptionMax: 200,
  maxItems: 30,
  maxAmount: 1_000_000_000,
  maxQuantity: 100_000,
} as const;
