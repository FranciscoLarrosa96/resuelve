import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { AcquisitionSource } from './public-links';

const KEY = 'resuelve.acquisition';
const sources: AcquisitionSource[] = ['PUBLIC_PROFILE', 'PROFILE_QR', 'PROFILE_SHARE', 'REFERRAL'];
/** Session-only provenance: no identity, IP, PII or cross-site identifiers. */
@Injectable({ providedIn: 'root' })
export class AcquisitionJourney {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  capture(source: AcquisitionSource): void {
    if (!this.browser) return;
    try {
      sessionStorage.setItem(KEY, JSON.stringify({ source, at: Date.now() }));
    } catch {
      /* optional storage */
    }
  }
  source(): AcquisitionSource {
    if (!this.browser) return 'MARKETPLACE';
    try {
      const value = JSON.parse(sessionStorage.getItem(KEY) || 'null');
      if (
        value &&
        sources.includes(value.source) &&
        typeof value.at === 'number' &&
        value.at <= Date.now() &&
        Date.now() - value.at < 12 * 3600000
      )
        return value.source;
    } catch {
      /* unknown data is never attribution */
    }
    return 'MARKETPLACE';
  }
}
