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
/** Cuántos días se muestra en Mi plan "Confirmamos / No pudimos confirmar tu transferencia". */
export const TRANSFER_OUTCOME_VISIBLE_DAYS = 7;

/**
 * El resultado de la revisión (confirmado o rechazado) se muestra solo los
 * primeros días: después es historia, no un aviso. Se deriva al consultar.
 */
export function transferOutcomeVisible(
  t: { status: string; reviewedAt: Date | null },
  now: Date,
): boolean {
  if (t.status !== 'APPROVED' && t.status !== 'REJECTED') return false;
  if (!t.reviewedAt) return false;
  return now.getTime() - t.reviewedAt.getTime() < TRANSFER_OUTCOME_VISIBLE_DAYS * DAY_MS;
}

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

/** Código de una solicitud de arrepentimiento recibida sin sesión: `ARR-` + 6 caracteres sin ambiguos. */
export function newWithdrawalRequestCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) code += REFERENCE_ALPHABET[randomInt(REFERENCE_ALPHABET.length)];
  return `ARR-${code}`;
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

/**
 * Hasta cuándo se puede pedir la devolución de un pago NUEVO (única fuente: backend, API, pantalla y
 * administración leen esto): `days` corridos desde el INICIO EFECTIVO del período pago. Se puede pedir
 * desde la confirmación. Si el período empieza en la confirmación (PRO inmediato, o Plus cuya
 * confirmación llega tarde) cuenta desde ahí; si empieza después (Plus programado) cuenta desde ese
 * inicio. `previous` es el vencimiento ya comunicado: nunca se acorta (si un reajuste adelanta el
 * período, rige el mayor entre el comunicado y los `days` desde el nuevo inicio).
 */
export function computeWithdrawalUntil(
  p: { reviewedAt: Date | null; periodStart: Date | null },
  days: number,
  previous: Date | null = null,
): Date | null {
  if (!p.reviewedAt) return previous;
  const effectiveStart = Math.max(p.reviewedAt.getTime(), p.periodStart?.getTime() ?? 0);
  const computed = effectiveStart + days * DAY_MS;
  return new Date(Math.max(computed, previous?.getTime() ?? 0));
}

/**
 * Vencimiento vigente de un pago ya confirmado: el comunicado (`withdrawalUntil`, guardado al
 * confirmar o reajustar). Un pago anterior a esta regla conserva sus `days` desde la confirmación
 * (la migración lo guarda así): sus condiciones no se reducen.
 */
export function transferWithdrawableUntil(
  p: { reviewedAt: Date | null; periodStart: Date | null; withdrawalUntil: Date | null },
  days: number,
): Date | null {
  if (p.withdrawalUntil) return p.withdrawalUntil;
  return p.reviewedAt ? new Date(p.reviewedAt.getTime() + days * DAY_MS) : null;
}

/**
 * Un pago confirmado, visto desde el arrepentimiento: "todavía no empezó" (el período pago arranca
 * después, p. ej. Plus que espera a que termine el PRO) o "ya empezó". La ventana de 10 días corre
 * desde la confirmación en los dos casos; lo que cambia es qué se quita al revocar, no el derecho.
 */
export function withdrawalPeriodState(periodStart: Date | null, now: Date): 'NOT_STARTED' | 'STARTED' {
  return periodStart && periodStart.getTime() > now.getTime() ? 'NOT_STARTED' : 'STARTED';
}

/**
 * Revocado un pago que tenía pagos posteriores, cada uno se adelanta para empezar cuando
 * corresponde SIN el período revocado: nadie recibe días que no pagó ni espera días que ya no
 * existen. Nunca se atrasa un período (`min` con su inicio actual) y se conserva su duración.
 * `base` son las demás fuentes de acceso y lo que sigue vigente de los pagos anteriores.
 */
export function retimeAfterRevocation(
  later: { id: string; months: number; periodStart: Date }[],
  base: Parameters<typeof transferPeriodStart>[0],
  now = new Date(),
): { id: string; periodStart: Date; periodEnd: Date }[] {
  let cursor = transferPeriodStart(base, now).getTime();
  return [...later]
    .sort((a, b) => a.periodStart.getTime() - b.periodStart.getTime())
    .map((l) => {
      // Un período que ya empezó (en curso o terminado) no se reinicia ni se mueve: ya se consumió.
      const periodStart =
        l.periodStart.getTime() <= now.getTime() ? l.periodStart : new Date(Math.min(Math.max(cursor, now.getTime()), l.periodStart.getTime()));
      const periodEnd = transferPeriodEnd(periodStart, l.months);
      cursor = Math.max(cursor, periodEnd.getTime());
      return { id: l.id, periodStart, periodEnd };
    });
}
