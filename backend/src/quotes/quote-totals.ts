import { Cents, fromCents, multiplyCents, toCents } from '../common/money/money';

export interface QuoteAmountsInput {
  laborAmount: number | string;
  /** Solo se usa si no hay ítems; con ítems, materiales = suma de ítems. */
  materialsAmount?: number | string;
  items?: { quantity: number | string; unitPrice: number | string }[];
}

export interface QuoteAmounts {
  laborAmount: string;
  materialsAmount: string;
  totalAmount: string;
}

/**
 * Calcula los montos del presupuesto en el servidor.
 * Nunca se acepta un total enviado por el cliente.
 */
export function computeQuoteAmounts(input: QuoteAmountsInput): QuoteAmounts {
  const labor: Cents = toCents(input.laborAmount);
  const materials: Cents = input.items?.length
    ? input.items.reduce((sum, item) => sum + multiplyCents(toCents(item.unitPrice), item.quantity), 0)
    : toCents(input.materialsAmount ?? 0);
  if (labor < 0 || materials < 0) throw new Error('Los montos no pueden ser negativos');
  return {
    laborAmount: fromCents(labor),
    materialsAmount: fromCents(materials),
    totalAmount: fromCents(labor + materials),
  };
}
