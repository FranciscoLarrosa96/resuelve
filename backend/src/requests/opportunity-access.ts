import { AccessResolution } from '../plans/plan';
import { RequestAttributionSource } from './request-invitation.entity';
import { InvitationStatus, RequestStatus, RequestUrgency } from './request.enums';
import { QUOTABLE_STATUSES } from './request-state-machine';

export interface OpportunityDelayConfig {
  enabled: boolean;
  freeDelayMinutes: number;
  urgentFreeDelayMinutes: number;
}

export function opportunityAvailableAt(input: {
  deliveredAt: Date;
  targeted: boolean;
  urgency: RequestUrgency;
  access: Pick<AccessResolution, 'billingPlan' | 'trialActive' | 'lifecycle'>;
  config: OpportunityDelayConfig;
}): Date {
  const { deliveredAt, targeted, urgency, access, config } = input;
  if (
    !config.enabled ||
    targeted ||
    access.billingPlan === 'PRO' ||
    access.trialActive ||
    access.lifecycle === 'PRE_FIRST_SUCCESS'
  )
    return deliveredAt;
  const minutes =
    urgency === RequestUrgency.URGENT || urgency === RequestUrgency.TODAY
      ? config.urgentFreeDelayMinutes
      : config.freeDelayMinutes;
  return new Date(deliveredAt.getTime() + minutes * 60_000);
}

export function effectiveOpportunityAvailableAt(input: {
  sentAt: Date;
  availableAt: Date | null | undefined;
  targeted: boolean;
  delayEnabled: boolean;
}): Date {
  if (!input.delayEnabled || input.targeted) return input.sentAt;
  return input.availableAt ?? input.sentAt;
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
