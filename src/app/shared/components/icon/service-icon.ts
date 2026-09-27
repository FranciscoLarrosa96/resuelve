import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { serviceIcon } from '../../../core/utils/service-icons';

/** Glifos de servicios (geometría de Lucide, ISC; mismo trazo que `app-icon`). */
export type ServiceGlyph =
  | 'zap'
  | 'flame'
  | 'droplets'
  | 'key'
  | 'snowflake'
  | 'paint-roller'
  | 'brick-wall'
  | 'hammer'
  | 'anvil'
  | 'plug'
  | 'scissors'
  | 'leaf'
  | 'tree'
  | 'shovel'
  | 'truck'
  | 'package'
  | 'sofa'
  | 'cctv'
  | 'network'
  | 'monitor'
  | 'wrench';

/**
 * Ícono de un servicio por slug (`SERVICE_ICONS`, único mapa). Decorativo:
 * el nombre del servicio siempre va al lado como texto. Sin entrada → neutro.
 */
@Component({
  selector: 'app-service-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex shrink-0', 'aria-hidden': 'true' },
  template: `
    <svg
      [attr.width]="size()"
      [attr.height]="size()"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      [attr.stroke-width]="stroke()"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      @switch (glyph()) {
        @case ('zap') { <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /> }
        @case ('flame') { <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z" /> }
        @case ('droplets') { <path d="M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05z" /><path d="M12.56 6.6A10.97 10.97 0 0 0 14 3.02c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a6.98 6.98 0 0 1-11.91 4.97" /> }
        @case ('key') { <circle cx="7.5" cy="15.5" r="5.5" /><path d="M21 2l-9.6 9.6M15.5 7.5l3 3L22 7l-3-3" /> }
        @case ('snowflake') { <path d="M2 12h20M12 2v20M20 16l-4-4 4-4M4 8l4 4-4 4M16 4l-4 4-4-4M8 20l4-4 4 4" /> }
        @case ('paint-roller') { <rect x="2" y="2" width="16" height="6" rx="2" /><path d="M10 16v-2a2 2 0 0 1 2-2h8a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" /><rect x="8" y="16" width="4" height="6" rx="1" /> }
        @case ('brick-wall') { <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M12 9v6M16 15v6M16 3v6M3 15h18M3 9h18M8 15v6M8 3v6" /> }
        @case ('hammer') { <path d="M15 12l-8.37 8.37a2.12 2.12 0 1 1-3-3L12 9" /><path d="M18 15l4-4" /><path d="M21.5 11.5l-1.91-1.91A2 2 0 0 1 19 8.17V7l-2.26-2.26a6 6 0 0 0-4.2-1.76L9 2.96l.92.82A6.18 6.18 0 0 1 12 8.4V10l2 2h1.17a2 2 0 0 1 1.42.59L18.5 14.5" /> }
        @case ('anvil') { <path d="M7 10H6a4 4 0 0 1-4-4 1 1 0 0 1 1-1h4" /><path d="M7 5a1 1 0 0 1 1-1h13a1 1 0 0 1 1 1 7 7 0 0 1-7 7H8a1 1 0 0 1-1-1z" /><path d="M9 12v5M15 12v5" /><path d="M5 20a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3 1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z" /> }
        @case ('plug') { <path d="M12 22v-5M9 8V2M15 8V2" /><path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8z" /> }
        @case ('scissors') { <circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M8.12 8.12L12 12M20 4L8.12 15.88M14.8 14.8L20 20" /> }
        @case ('leaf') { <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z" /><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" /> }
        @case ('tree') { <path d="M8 19a4 4 0 0 1-2.24-7.32A3.5 3.5 0 0 1 9 6.03V6a3 3 0 1 1 6 0v.04a3.5 3.5 0 0 1 3.24 5.65A4 4 0 0 1 16 19z" /><path d="M12 19v3" /> }
        @case ('shovel') { <path d="M2 22v-5l5-5 5 5-5 5z" /><path d="M9.5 14.5L16 8" /><path d="M17 2l5 5-.5.5a3.53 3.53 0 0 1-5 0 3.53 3.53 0 0 1 0-5L17 2" /> }
        @case ('truck') { <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2M15 18H9" /><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14" /><circle cx="17" cy="18" r="2" /><circle cx="7" cy="18" r="2" /> }
        @case ('package') { <path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z" /><path d="M12 22V12M3.3 7l8.7 5 8.7-5M7.5 4.27l9 5.15" /> }
        @case ('sofa') { <path d="M20 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v3" /><path d="M2 16a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5a2 2 0 0 0-4 0v1.5a.5.5 0 0 1-.5.5h-11a.5.5 0 0 1-.5-.5V11a2 2 0 0 0-4 0z" /><path d="M4 18v2M20 18v2M12 4v9" /> }
        @case ('cctv') { <path d="M16.75 12h3.63a1 1 0 0 1 .9 1.45l-2.04 4.07a1 1 0 0 1-1.7.13l-2.13-2.97" /><path d="M17.1 9.05a1 1 0 0 1 .45 1.34l-3.1 6.21a1 1 0 0 1-1.35.45L3.61 12.3a2.92 2.92 0 0 1-1.3-3.91L3.69 5.6a2.92 2.92 0 0 1 3.92-1.3z" /><path d="M2 19h3.76a2 2 0 0 0 1.8-1.1L9 15M2 21v-4M7 9h.01" /> }
        @case ('network') { <rect x="16" y="16" width="6" height="6" rx="1" /><rect x="2" y="16" width="6" height="6" rx="1" /><rect x="9" y="2" width="6" height="6" rx="1" /><path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3M12 12V8" /> }
        @case ('monitor') { <rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" /> }
        @case ('wrench') { <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" /> }
      }
    </svg>
  `,
})
export class ServiceIcon {
  readonly slug = input<string | null | undefined>(null);
  readonly size = input(18);
  readonly stroke = input(1.9);
  protected readonly glyph = computed(() => serviceIcon(this.slug()));
}
