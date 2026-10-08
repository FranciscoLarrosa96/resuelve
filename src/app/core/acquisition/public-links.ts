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
  /** Enlace fijo para que los clientes del profesional le dejen una reseña (QR o WhatsApp). */
  review(p: { id: string; slug?: string }): string {
    return `${this.origin}${p.slug ? '/p/' + encodeURIComponent(p.slug) : '/profesional/' + encodeURIComponent(p.id)}/resenar`;
  }
  /** Reseña de un trabajo hecho por Resuelve: el cliente la deja desde su solicitud (suma al puntaje). */
  jobReview(requestId: string): string {
    return `${this.origin}/mis-solicitudes/${encodeURIComponent(requestId)}#resena`;
  }
  referral(code: string): string {
    return `${this.origin}/registro/profesional?ref=${encodeURIComponent(code)}`;
  }
}
