/**
 * Dinero.
 *
 * - En PostgreSQL: `numeric(12,2)`. El driver `pg` lo devuelve como string
 *   ("52000.00"), así que nunca pasa por float al leer.
 * - Internamente: centavos enteros (`number` entero; alcanza para montos
 *   hasta 9 billones sin perder precisión).
 * - En la API: string con dos decimales ("52000.00").
 */
export type Cents = number;

const MONEY_PATTERN = /^-?\d+(\.\d{1,2})?$/;

/** "52000.5" | 52000.5 → 5200050 */
export function toCents(value: string | number): Cents {
  const text = typeof value === 'number' ? value.toFixed(2) : value.trim();
  if (!MONEY_PATTERN.test(text)) throw new Error(`Monto inválido: ${value}`);
  const negative = text.startsWith('-');
  const [units, decimals = ''] = text.replace('-', '').split('.');
  const cents = Number(units) * 100 + Number(decimals.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents)) throw new Error(`Monto fuera de rango: ${value}`);
  return negative ? -cents : cents;
}

/** 5200050 → "52000.50" */
export function fromCents(cents: Cents): string {
  if (!Number.isInteger(cents)) throw new Error(`Centavos no enteros: ${cents}`);
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const text = `${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
  return negative ? `-${text}` : text;
}

/** cantidad (hasta 2 decimales) × precio unitario, redondeado a centavos (half-up). */
export function multiplyCents(unitPrice: Cents, quantity: string | number): Cents {
  const qtyHundredths = toCents(quantity); // cantidad × 100
  const product = unitPrice * qtyHundredths;
  return Math.sign(product) * Math.round(Math.abs(product) / 100);
}

/** Transformer de TypeORM para columnas numeric: normaliza a "0.00". */
export const moneyTransformer = {
  to: (value: string | number | null | undefined) =>
    value === null || value === undefined ? value : fromCents(toCents(value)),
  from: (value: string | null) => (value === null ? value : fromCents(toCents(value))),
};
