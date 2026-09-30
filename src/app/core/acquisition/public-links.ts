import { DOCUMENT } from '@angular/common';
import { Injectable, REQUEST, inject } from '@angular/core';
import { environment } from '../../../environments/environment';

export type AcquisitionSource =
  'MARKETPLACE' | 'PUBLIC_PROFILE' | 'PROFILE_QR' | 'PROFILE_SHARE' | 'REFERRAL';
export function profileSource(src?: string): AcquisitionSource {
  return src === 'qr' ? 'PROFILE_QR' : src === 'share' ? 'PROFILE_SHARE' : 'PUBLIC_PROFILE';
}

@Injectable({ providedIn: 'root' })
export class PublicLinks {
  private readonly document = inject(DOCUMENT);
  private readonly request = inject(REQUEST, { optional: true });
  readonly origin =
    environment.publicAppUrl ||
    (this.request ? new URL(this.request.url).origin : this.document.location?.origin || '');
  profile(p: { id: string; slug?: string }, src?: 'qr' | 'share'): string {
    return `${this.origin}${p.slug ? '/p/' + encodeURIComponent(p.slug) : '/profesional/' + encodeURIComponent(p.id)}${src ? '?src=' + src : ''}`;
  }
  referral(code: string): string {
    return `${this.origin}/registro/profesional?ref=${encodeURIComponent(code)}`;
  }
}
