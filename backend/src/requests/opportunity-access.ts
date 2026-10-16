import { AccessResolution } from '../plans/plan';
import { RequestAttributionSource } from './request-invitation.entity';
import { InvitationStatus, RequestStatus, RequestUrgency } from './request.enums';
import { QUOTABLE_STATUSES } from './request-state-machine';

export interface OpportunityDelayConfig {
  enabled: boolean;
  freeDelayMinutes: number;
}

/**
 * Pedidos que nunca se demoran para Free: lo que es para hoy o urgente se responde apenas
 * llega, sin ventana de ventaja para nadie.
 */
export const DELAY_EXEMPT_URGENCIES: readonly RequestUrgency[] = [RequestUrgency.TODAY, RequestUrgency.URGENT];

/**
 * Cuándo puede responder un profesional una solicitud nueva. Solo se demora a un Free
 * posterior al primer éxito, en un pedido normal (no dirigido, ni de hoy ni urgente), y
 * únicamente si un PRO elegible del MISMO pedido tuvo acceso antes (`proAccessAt`): sin PRO
 * delante no hay a quién cederle ventaja y la demora sería puro costo. La ventana corre desde
 * que el PRO la recibió, de modo que a quien se suma después ya no se lo hace esperar de más.
 */
export function opportunityAvailableAt(input: {
  deliveredAt: Date;
  targeted: boolean;
  urgency: RequestUrgency;
  access: Pick<AccessResolution, 'billingPlan' | 'trialActive' | 'lifecycle'>;
  config: OpportunityDelayConfig;
  /** Cuándo un PRO elegible de este pedido pudo verlo por primera vez (null = no hay ninguno). */
  proAccessAt: Date | null;
}): Date {
  const { deliveredAt, targeted, urgency, access, config, proAccessAt } = input;
  if (
    !config.enabled ||
    config.freeDelayMinutes <= 0 ||
    !proAccessAt ||
    targeted ||
    DELAY_EXEMPT_URGENCIES.includes(urgency) ||
    access.billingPlan !== 'FREE' ||
    access.trialActive ||
    access.lifecycle === 'PRE_FIRST_SUCCESS'
  )
    return deliveredAt;
  const releasedAt = proAccessAt.getTime() + config.freeDelayMinutes * 60_000;
  return new Date(Math.max(deliveredAt.getTime(), releasedAt));
}

/**
 * Cuándo puede responder esta invitación hoy y cuánto le llegó después que a un PRO.
 * Dos preguntas distintas con una sola regla:
 * - `availableAt` (acceso): lo guardado, salvo que la demora no esté justificada con la regla
 *   actual (pedido de hoy/urgente, o ningún PRO delante). Así una solicitud enviada antes de
 *   esta regla que todavía está demorada se libera sin tocar lo registrado.
 * - `lateByMinutes` / `provenLateAt` (hecho comercial): solo si quedó registrado que un PRO
 *   del mismo pedido la recibió antes (`proAccessAt`, de `PRO_EARLY_OPPORTUNITY_SQL`). Nunca
 *   se deduce del plan que el profesional tiene hoy.
 */
export function resolveOpportunityTiming(input: {
  sentAt: Date;
  availableAt: Date | null | undefined;
  targeted: boolean;
  delayEnabled: boolean;
  urgency: RequestUrgency;
  /** Cuándo un PRO de este pedido tuvo acceso, según lo registrado en ese momento. */
  proAccessAt: Date | null | undefined;
}): { availableAt: Date; provenLateAt: Date | null; lateByMinutes: number } {
  const stored = input.availableAt ?? input.sentAt;
  const delayed = stored.getTime() > input.sentAt.getTime();
  if (!input.delayEnabled || input.targeted || !delayed) {
    return { availableAt: input.sentAt, provenLateAt: null, lateByMinutes: 0 };
  }
  const proven = !!input.proAccessAt && input.proAccessAt.getTime() < stored.getTime();
  return {
    availableAt: !proven || DELAY_EXEMPT_URGENCIES.includes(input.urgency) ? input.sentAt : stored,
    provenLateAt: proven ? stored : null,
    lateByMinutes: proven ? Math.round((stored.getTime() - input.sentAt.getTime()) / 60_000) : 0,
  };
}

export function isActionableOpportunity(input: {
  requestStatus: RequestStatus;
  invitationStatus: InvitationStatus;
  targeted: boolean;
  availableAt: Date;
  activeQuoteCount: number;
  maxActiveQuotes: number;
  blockedByFreeQuota: boolean;
  ownActiveQuote: boolean;
  now: Date;
}): boolean {
  return (
    input.invitationStatus === InvitationStatus.PENDING &&
    QUOTABLE_STATUSES.includes(input.requestStatus) &&
    (input.targeted || input.now >= input.availableAt) &&
    !input.blockedByFreeQuota &&
    !input.ownActiveQuote &&
    input.activeQuoteCount < input.maxActiveQuotes
  );
}

export function classifyInvitationSource(input: {
  targeted: boolean;
  requestedSource?: RequestAttributionSource;
  verifiedFeaturedJourney: boolean;
  enabled: boolean;
}): RequestAttributionSource {
  if (!input.enabled) return RequestAttributionSource.OTHER;
  if (
    input.targeted &&
    [
      RequestAttributionSource.PUBLIC_PROFILE,
      RequestAttributionSource.PROFILE_QR,
      RequestAttributionSource.PROFILE_SHARE,
      RequestAttributionSource.REFERRAL,
    ].includes(input.requestedSource!)
  )
    return input.requestedSource!;
  if (input.targeted && input.verifiedFeaturedJourney) return RequestAttributionSource.PRO_FEATURED;
  if (input.targeted) {
    if (input.requestedSource === RequestAttributionSource.DIRECT_PUBLIC_PROFILE) {
      return RequestAttributionSource.DIRECT_PUBLIC_PROFILE;
    }
    if (input.requestedSource === RequestAttributionSource.ORGANIC_SEARCH) {
      return RequestAttributionSource.ORGANIC_SEARCH;
    }
    return RequestAttributionSource.DIRECT_TARGETED;
  }
  if (
    input.requestedSource === RequestAttributionSource.MULTI_SELECT ||
    input.requestedSource === RequestAttributionSource.MARKETPLACE_DISCOVERY ||
    input.requestedSource === RequestAttributionSource.ORGANIC_SEARCH
  ) {
    return input.requestedSource;
  }
  return RequestAttributionSource.OTHER;
}

export function hasVerifiedFeaturedJourney(input: {
  featuredImpressionAt: Date | null;
  profileViewAt: Date | null;
  requestAt: Date;
  windowMinutes?: number;
}): boolean {
  const { featuredImpressionAt, profileViewAt, requestAt, windowMinutes = 30 } = input;
  if (!featuredImpressionAt || !profileViewAt) return false;
  const windowMs = windowMinutes * 60_000;
  return (
    featuredImpressionAt <= profileViewAt &&
    requestAt >= profileViewAt &&
    requestAt.getTime() - profileViewAt.getTime() <= windowMs &&
    profileViewAt.getTime() - featuredImpressionAt.getTime() <= windowMs
  );
}
