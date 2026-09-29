import { RequestAttributionSource } from './request-invitation.entity';
import { InvitationStatus, RequestStatus, RequestUrgency } from './request.enums';
import { PlanTier } from '../professionals/professional.enums';
import {
  classifyInvitationSource,
  hasVerifiedFeaturedJourney,
  isActionableOpportunity,
  opportunityAvailableAt,
} from './opportunity-access';

const now = new Date('2026-09-28T12:00:00.000Z');
const delayConfig = { enabled: true, freeDelayMinutes: 30, urgentFreeDelayMinutes: 30 };
const free = { billingPlan: PlanTier.FREE, trialActive: false, lifecycle: 'POST_FIRST_SUCCESS' as const };
const freeBeforeSuccess = { billingPlan: PlanTier.FREE, trialActive: false, lifecycle: 'PRE_FIRST_SUCCESS' as const };
const pro = { billingPlan: PlanTier.PRO, trialActive: false, lifecycle: 'POST_FIRST_SUCCESS' as const };
const trial = { billingPlan: PlanTier.FREE, trialActive: true, lifecycle: 'PRE_FIRST_SUCCESS' as const };

describe('Fase 2: acceso y acción sobre oportunidades', () => {
  it('PRO y FIRST_SUCCESS_TRIAL ven discovery al entregarse; Free espera el delay configurable', () => {
    const deliveredAt = now;
    expect(opportunityAvailableAt({ deliveredAt, targeted: false, urgency: RequestUrgency.FLEXIBLE, access: pro, config: delayConfig })).toEqual(deliveredAt);
    expect(opportunityAvailableAt({ deliveredAt, targeted: false, urgency: RequestUrgency.FLEXIBLE, access: trial, config: delayConfig })).toEqual(deliveredAt);
    expect(opportunityAvailableAt({ deliveredAt, targeted: false, urgency: RequestUrgency.FLEXIBLE, access: free, config: delayConfig })).toEqual(new Date(now.getTime() + 30 * 60_000));
    expect(opportunityAvailableAt({ deliveredAt, targeted: false, urgency: RequestUrgency.FLEXIBLE, access: freeBeforeSuccess, config: delayConfig })).toEqual(deliveredAt);
  });

  it('directa targeted y urgencia respetan sus reglas independientes', () => {
    expect(opportunityAvailableAt({ deliveredAt: now, targeted: true, urgency: RequestUrgency.FLEXIBLE, access: free, config: delayConfig })).toEqual(now);
    const urgentConfig = { ...delayConfig, urgentFreeDelayMinutes: 45 };
    expect(opportunityAvailableAt({ deliveredAt: now, targeted: false, urgency: RequestUrgency.URGENT, access: free, config: urgentConfig })).toEqual(new Date(now.getTime() + 45 * 60_000));
    expect(opportunityAvailableAt({ deliveredAt: now, targeted: false, urgency: RequestUrgency.TODAY, access: free, config: urgentConfig })).toEqual(new Date(now.getTime() + 45 * 60_000));
  });

  it('solo cuenta oportunidades pendientes, abiertas, desbloqueadas y con lugar disponible', () => {
    const base = {
      requestStatus: RequestStatus.WAITING_QUOTES,
      invitationStatus: InvitationStatus.PENDING,
      targeted: false,
      availableAt: now,
      activeQuoteCount: 4,
      maxActiveQuotes: 5,
      blockedByFreeQuota: false,
      ownActiveQuote: false,
      now,
    };
    expect(isActionableOpportunity(base)).toBe(true);
    expect(isActionableOpportunity({ ...base, requestStatus: RequestStatus.CANCELLED })).toBe(false);
    expect(isActionableOpportunity({ ...base, requestStatus: RequestStatus.COMPLETED })).toBe(false);
    expect(isActionableOpportunity({ ...base, invitationStatus: InvitationStatus.QUOTED })).toBe(false);
    expect(isActionableOpportunity({ ...base, availableAt: new Date(now.getTime() + 1) })).toBe(false);
    expect(isActionableOpportunity({ ...base, activeQuoteCount: 5 })).toBe(false);
    expect(isActionableOpportunity({ ...base, blockedByFreeQuota: true })).toBe(false);
    expect(isActionableOpportunity({ ...base, ownActiveQuote: true })).toBe(false);
  });

  it('solo atribuye PRO destacado con impresión, visita posterior y solicitud dentro de la ventana', () => {
    const impression = new Date(now.getTime() - 120_000);
    const view = new Date(now.getTime() - 60_000);
    expect(hasVerifiedFeaturedJourney({ featuredImpressionAt: impression, profileViewAt: view, requestAt: now })).toBe(true);
    expect(hasVerifiedFeaturedJourney({ featuredImpressionAt: null, profileViewAt: view, requestAt: now })).toBe(false);
    expect(hasVerifiedFeaturedJourney({ featuredImpressionAt: view, profileViewAt: impression, requestAt: now })).toBe(false);
    expect(hasVerifiedFeaturedJourney({ featuredImpressionAt: impression, profileViewAt: view, requestAt: new Date(view.getTime() + 31 * 60_000) })).toBe(false);
    expect(classifyInvitationSource({ targeted: true, requestedSource: RequestAttributionSource.PRO_FEATURED, verifiedFeaturedJourney: false, enabled: true })).toBe(RequestAttributionSource.DIRECT_TARGETED);
    expect(classifyInvitationSource({ targeted: true, requestedSource: RequestAttributionSource.DIRECT_PUBLIC_PROFILE, verifiedFeaturedJourney: false, enabled: true })).toBe(RequestAttributionSource.DIRECT_PUBLIC_PROFILE);
    expect(classifyInvitationSource({ targeted: true, requestedSource: RequestAttributionSource.PRO_FEATURED, verifiedFeaturedJourney: true, enabled: true })).toBe(RequestAttributionSource.PRO_FEATURED);
    expect(classifyInvitationSource({ targeted: false, requestedSource: RequestAttributionSource.MULTI_SELECT, verifiedFeaturedJourney: true, enabled: true })).toBe(RequestAttributionSource.MULTI_SELECT);
    expect(classifyInvitationSource({ targeted: false, requestedSource: RequestAttributionSource.ORGANIC_SEARCH, verifiedFeaturedJourney: false, enabled: true })).toBe(RequestAttributionSource.ORGANIC_SEARCH);
    expect(classifyInvitationSource({ targeted: false, verifiedFeaturedJourney: false, enabled: false })).toBe(RequestAttributionSource.OTHER);
  });
});
