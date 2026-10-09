import { randomInt } from 'crypto';

/**
 * Reglas del pago de PRO por transferencia. Funciones puras (sin base ni
 * HTTP): única fuente de períodos, montos, desde cuándo corre un período y
 * qué datos bancarios son válidos.
 */

export const DAY_MS = 86_400_000;
/** Un mes de PRO por transferencia = 30 días corridos. */
export const DAYS_PER_MONTH = 30;
/** Períodos que se pueden pagar por adelantado. */
export const TRANSFER_PERIODS = [1, 3, 6] as const;
export type TransferPeriod = (typeof TRANSFER_PERIODS)[number];
/** El archivo del comprobante se borra después de esto (el registro del pago queda). */
export const PROOF_RETENTION_DAYS = 90;
/** Aviso "Tu PRO vence pronto" (una vez por período). */
export const EXPIRY_REMINDER_DAYS = 3;

export const isTransferPeriod = (months: number): months is TransferPeriod =>
  (TRANSFER_PERIODS as readonly number[]).includes(months);

/**
 * Monto a transferir: precio vigente × meses (sin descuento por período). La
 * oferta de bienvenida, si es elegible, aplica solo al primer mes.
 */
export function transferAmount(basePriceArs: number, months: number, discountedFirstMonthArs: number | null): number {
  const first = discountedFirstMonthArs ?? basePriceArs;
  return first + basePriceArs * (months - 1);
}

/**
 * Desde cuándo corre un período nuevo: no se pisa PRO ya vigente (bonus,
 * cortesía con vencimiento, lo pagado por MP tras cancelar ni otra
 * transferencia), así nadie pierde días. Un PRO manual sin vencimiento no
 * cuenta (no hay fecha que respetar).
 */
export function transferPeriodStart(
  p: {
    transferProUntil?: Date | null;
    billingProUntil?: Date | null;
    bonusProUntil?: Date | null;
    planExpiresAt?: Date | null;
    manualPro: boolean;
  },
  now = new Date(),
): Date {
  const candidates = [p.transferProUntil, p.billingProUntil, p.bonusProUntil, p.manualPro ? p.planExpiresAt : null];
  let start = now.getTime();
  for (const d of candidates) if (d && d.getTime() > start) start = d.getTime();
  return new Date(start);
}

export const transferPeriodEnd = (start: Date, months: number): Date =>
  new Date(start.getTime() + months * DAYS_PER_MONTH * DAY_MS);

/** Código del concepto: `RES-` + 6 caracteres sin ambiguos (sin 0/O, 1/I/L). */
const REFERENCE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function newTransferReference(): string {
  let code = '';
  for (let i = 0; i < 6; i++) code += REFERENCE_ALPHABET[randomInt(REFERENCE_ALPHABET.length)];
  return `RES-${code}`;
}

/** Alias de CBU/CVU: 6 a 20 caracteres, letras, números, punto y guion. */
export const ALIAS_PATTERN = /^[A-Za-z0-9.-]{6,20}$/;
/** CBU/CVU: 22 dígitos. */
export const CBU_PATTERN = /^\d{22}$/;

/**
 * Dígitos verificadores de un CBU/CVU (dos bloques: 8 y 14 dígitos). Atrapa
 * un número mal tipeado antes de publicarlo como dato para transferir.
 */
export function isValidCbu(cbu: string): boolean {
  if (!CBU_PATTERN.test(cbu)) return false;
  const check = (digits: string, weights: number[]) => {
    const body = digits.slice(0, -1);
    const sum = [...body].reduce((acc, d, i) => acc + Number(d) * weights[i % weights.length], 0);
    return (10 - (sum % 10)) % 10 === Number(digits.at(-1));
  };
  return check(cbu.slice(0, 8), [7, 1, 3, 9, 7, 1, 3]) && check(cbu.slice(8), [3, 9, 7, 1, 3, 9, 7, 1, 3, 9, 7, 1, 3]);
}

/** Destino de una devolución: alias o CBU/CVU válidos. */
export const isValidRefundDestination = (value: string): boolean =>
  CBU_PATTERN.test(value) ? isValidCbu(value) : ALIAS_PATTERN.test(value);

/** ¿Puede arrepentirse? `days` corridos desde que se aprobó el pago. */
export function transferWithdrawableUntil(approvedAt: Date | null, days: number): Date | null {
  return approvedAt ? new Date(approvedAt.getTime() + days * DAY_MS) : null;
}
