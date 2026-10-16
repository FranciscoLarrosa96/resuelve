import { RequestAttributionSource } from './request-invitation.entity';
import { InvitationStatus, RequestStatus, RequestUrgency } from './request.enums';
import { PlanTier } from '../professionals/professional.enums';
import {
  classifyInvitationSource,
  hasVerifiedFeaturedJourney,
  isActionableOpportunity,
  opportunityAvailableAt,
  resolveOpportunityTiming,
} from './opportunity-access';

const now = new Date('2026-09-28T12:00:00.000Z');
const delayConfig = { enabled: true, freeDelayMinutes: 30 };
const free = { billingPlan: PlanTier.FREE, trialActive: false, lifecycle: 'POST_FIRST_SUCCESS' as const };
const freeBeforeSuccess = { billingPlan: PlanTier.FREE, trialActive: false, lifecycle: 'PRE_FIRST_SUCCESS' as const };
const pro = { billingPlan: PlanTier.PRO, trialActive: false, lifecycle: 'POST_FIRST_SUCCESS' as const };
const trial = { billingPlan: PlanTier.FREE, trialActive: true, lifecycle: 'PRE_FIRST_SUCCESS' as const };

describe('Fase 2: acceso y acción sobre oportunidades', () => {
  const at = (access: Parameters<typeof opportunityAvailableAt>[0]['access'], extra: Partial<Parameters<typeof opportunityAvailableAt>[0]> = {}) =>
    opportunityAvailableAt({
      deliveredAt: now,
      targeted: false,
      urgency: RequestUrgency.FLEXIBLE,
      access,
      config: delayConfig,
      proAccessAt: now,
      ...extra,
    });
  const minutes = (d: Date) => (d.getTime() - now.getTime()) / 60_000;

  it('PRO y FIRST_SUCCESS_TRIAL ven discovery al entregarse; Free espera solo si hay un PRO delante', () => {
    expect(at(pro)).toEqual(now);
    expect(at(trial)).toEqual(now);
    expect(minutes(at(free))).toBe(30);
    expect(at(freeBeforeSuccess)).toEqual(now);
  });

  it('sin ningún PRO en el pedido no hay demora para Free', () => {
    expect(at(free, { proAccessAt: null })).toEqual(now);
  });

  it('la ventana corre desde el acceso del PRO: quien se suma después no espera de más', () => {
    const tenMinutesAgo = new Date(now.getTime() - 10 * 60_000);
    const twoHoursAgo = new Date(now.getTime() - 120 * 60_000);
    expect(minutes(at(free, { proAccessAt: tenMinutesAgo }))).toBe(20);
    expect(at(free, { proAccessAt: twoHoursAgo })).toEqual(now);
  });

  it('dirigido, hoy y urgente no se demoran nunca; sin demora configurada tampoco', () => {
    expect(at(free, { targeted: true })).toEqual(now);
    expect(at(free, { urgency: RequestUrgency.URGENT })).toEqual(now);
    expect(at(free, { urgency: RequestUrgency.TODAY })).toEqual(now);
    expect(at(free, { config: { ...delayConfig, freeDelayMinutes: 0 } })).toEqual(now);
    expect(at(free, { config: { ...delayConfig, enabled: false } })).toEqual(now);
  });
});

describe('resolveOpportunityTiming: solicitudes ya enviadas', () => {
  const sentAt = new Date('2026-09-28T11:00:00.000Z');
  const stored = new Date(sentAt.getTime() + 30 * 60_000);
  const base = { sentAt, availableAt: stored, targeted: false, delayEnabled: true, urgency: RequestUrgency.FLEXIBLE };
  const proEarly = new Date(sentAt.getTime());

  it('demora demostrada con un PRO del mismo pedido: se conserva y se informa', () => {
    expect(resolveOpportunityTiming({ ...base, proAccessAt: proEarly })).toEqual({
      availableAt: stored,
      provenLateAt: stored,
      lateByMinutes: 30,
    });
  });

  it('demora sin evidencia de PRO: se libera para responder y no se presenta como hecho', () => {
    expect(resolveOpportunityTiming({ ...base, proAccessAt: undefined })).toEqual({
      availableAt: sentAt,
      provenLateAt: null,
      lateByMinutes: 0,
    });
  });

  it('un acceso de PRO posterior a la habilitación no demuestra nada', () => {
    expect(resolveOpportunityTiming({ ...base, proAccessAt: new Date(stored.getTime() + 1) }).lateByMinutes).toBe(0);
  });

  it('hoy/urgente liberado antes de cumplir la espera: acceso inmediato y NINGUNA demora', () => {
    const now = new Date(sentAt.getTime() + 5 * 60_000);
    expect(resolveOpportunityTiming({ ...base, urgency: RequestUrgency.URGENT, proAccessAt: proEarly, now })).toEqual({
      availableAt: sentAt,
      provenLateAt: null,
      lateByMinutes: 0,
    });
  });

  it('hoy/urgente con la espera ya cumplida: la demora ocurrió y se conserva', () => {
    const now = new Date(stored.getTime() + 1);
    const r = resolveOpportunityTiming({ ...base, urgency: RequestUrgency.TODAY, proAccessAt: proEarly, now });
    expect(r.availableAt).toEqual(sentAt);
    expect(r.lateByMinutes).toBe(30);
  });

  it('pedido normal con la espera por delante: sigue demorado y la espera es real', () => {
    const now = new Date(sentAt.getTime() + 5 * 60_000);
    expect(resolveOpportunityTiming({ ...base, proAccessAt: proEarly, now })).toMatchObject({ availableAt: stored, lateByMinutes: 30 });
  });

  it('dirigido o sin demora: a tiempo', () => {
    expect(resolveOpportunityTiming({ ...base, targeted: true, proAccessAt: proEarly }).lateByMinutes).toBe(0);
    expect(resolveOpportunityTiming({ ...base, availableAt: sentAt, proAccessAt: proEarly })).toEqual({
      availableAt: sentAt,
      provenLateAt: null,
      lateByMinutes: 0,
    });
    expect(resolveOpportunityTiming({ ...base, delayEnabled: false, proAccessAt: proEarly }).availableAt).toEqual(sentAt);
  });
});

describe('Fase 2: oportunidades accionables', () => {
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
