import type { ConfigService } from '@nestjs/config';
import { PlanTier } from '../professionals/professional.enums';
import { BillingSubscriptionStatus } from '../billing/billing.enums';
import type { BillingSubscription } from '../billing/billing-subscription.entity';

/**
 * Cambio programado PRO → PRO Plus: única fuente de las reglas puras. Solo el cambio hacia
 * arriba; Plus → PRO queda fuera. Sin prorrateo: nunca se cobra ni se regala parte de un período.
 *
 * - Transferencia: Plus se compra por adelantado y arranca al terminar el PRO ya pagado
 *   (`transfer-rules.ts → transferPeriodStart`). Si el admin confirma tarde, el período arranca
 *   en la confirmación: no se descuentan días anteriores.
 * - Mercado Pago: tres momentos distintos y nunca confundidos. SOLICITADO (intención guardada),
 *   CONFIRMADO por el proveedor (el preapproval informa el monto nuevo) y ACTIVO (el cobro de
 *   Plus figura aprobado: recién ahí cambia el plan).
 */

/** Intentos de modificar el monto antes de descartar el cambio y volver al anterior. */
export const MAX_PLAN_CHANGE_ATTEMPTS = 5;

export interface PlanChangeFlags {
  transfer: boolean;
  mercadoPago: boolean;
  /** Horas mínimas antes del próximo cobro de Mercado Pago (margen provisional, sin verificar con el proveedor). */
  minHoursBeforeCharge: number;
}

export function planChangeFlags(config: Pick<ConfigService, 'get'>): PlanChangeFlags {
  return {
    transfer: config.get<boolean>('PLAN_CHANGE_TRANSFER_ENABLED', false) === true,
    mercadoPago: config.get<boolean>('PLAN_CHANGE_MP_ENABLED', false) === true,
    minHoursBeforeCharge: config.get<number>('PLAN_CHANGE_MIN_HOURS_BEFORE_CHARGE', 24),
  };
}

/** Solo se programa el paso de PRO a PRO Plus. */
export const isScheduledUpgrade = (current: PlanTier, requested: PlanTier): boolean =>
  current === PlanTier.PRO && requested === PlanTier.PRO_PLUS;

/** Estado del cambio pendiente en Mercado Pago (null = no hay). ACTIVO no existe acá: ya es el plan. */
export type MpPlanChangeState = 'REQUESTED' | 'CONFIRMED' | 'REVERTING';

type PendingFields = Pick<BillingSubscription, 'pendingPlanTier' | 'pendingConfirmedAt' | 'pendingRevertingAt'>;

export function mpPlanChangeState(s: PendingFields): MpPlanChangeState | null {
  if (!s.pendingPlanTier) return null;
  if (s.pendingRevertingAt) return 'REVERTING';
  return s.pendingConfirmedAt ? 'CONFIRMED' : 'REQUESTED';
}

/** ¿Falta el margen mínimo antes del próximo cobro? Sin fecha de cobro tampoco se pide. */
export function hasChargeMargin(nextPaymentAt: Date | null, now: Date, minHours: number): boolean {
  return !!nextPaymentAt && nextPaymentAt.getTime() - now.getTime() >= minHours * 3_600_000;
}

/**
 * Un cobro aprobado activa Plus únicamente si es el cobro de Plus: el monto coincide con el
 * congelado al pedir el cambio y es posterior al pedido. Un cobro con el monto anterior (o
 * cualquier otro) NUNCA activa Plus.
 */
export function chargeActivatesPlan(
  s: Pick<BillingSubscription, 'pendingPlanTier' | 'pendingAmount' | 'pendingRequestedAt' | 'status' | 'withdrawnAt'>,
  chargedAmount: number,
  at: Date,
): boolean {
  return (
    !!s.pendingPlanTier &&
    s.pendingAmount !== null &&
    !!s.pendingRequestedAt &&
    chargedAmount === s.pendingAmount &&
    at >= s.pendingRequestedAt &&
    !s.withdrawnAt &&
    s.status !== BillingSubscriptionStatus.CANCELLED
  );
}
