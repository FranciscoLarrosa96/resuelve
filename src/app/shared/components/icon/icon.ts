import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type IconName =
  | 'check'
  | 'arrow-right'
  | 'chevron-left'
  | 'chevron-right'
  | 'chevron-down'
  | 'pin'
  | 'clock'
  | 'mic'
  | 'camera'
  | 'plus'
  | 'search'
  | 'lock'
  | 'locate'
  | 'home'
  | 'list'
  | 'user'
  | 'calendar'
  | 'inbox'
  | 'agenda'
  | 'chart'
  | 'person'
  | 'star'
  | 'shield'
  | 'close'
  | 'compare'
  | 'eye'
  | 'eye-off'
  | 'logout'
  | 'info'
  | 'briefcase'
  | 'document'
  | 'trend'
  | 'users'
  | 'message'
  | 'pencil'
  | 'external'
  | 'check-circle'
  | 'alert'
  | 'pause'
  | 'swap'
  | 'map'
  | 'send'
  | 'hourglass';

/** Set de íconos lineales del prototipo (stroke = currentColor). */
@Component({
  selector: 'app-icon',
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
      @switch (name()) {
        @case ('check') { <path d="M5 12.5l4.5 4.5L19 7" /> }
        @case ('arrow-right') { <path d="M5 12h14M13 6l6 6-6 6" /> }
        @case ('chevron-left') { <path d="M15 5l-7 7 7 7" /> }
        @case ('chevron-right') { <path d="M9 6l6 6-6 6" /> }
        @case ('chevron-down') { <path d="M6 9l6 6 6-6" /> }
        @case ('pin') {
          <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" />
          <circle cx="12" cy="9.5" r="2.5" />
        }
        @case ('clock') { <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /> }
        @case ('mic') {
          <rect x="9" y="3" width="6" height="11" rx="3" />
          <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
        }
        @case ('camera') { <path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /> }
        @case ('plus') { <path d="M12 5v14M5 12h14" /> }
        @case ('search') { <circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /> }
        @case ('lock') { <rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /> }
        @case ('locate') { <circle cx="12" cy="12" r="3" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4" /> }
        @case ('home') { <path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z" /> }
        @case ('list') { <path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" /> }
        @case ('user') { <circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /> }
        @case ('calendar') { <rect x="4" y="5" width="16" height="16" rx="3" /><path d="M4 10h16M9 3v4M15 3v4" /> }
        @case ('inbox') { <path d="M4 13l2.5-8h11L20 13v6H4zM4 13h5l1 2h4l1-2h5" /> }
        @case ('agenda') { <path d="M4 6h16v14H4zM4 10h16M8 3v4M16 3v4" /> }
        @case ('chart') { <path d="M5 20V11M12 20V5M19 20v-8" /> }
        @case ('person') { <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0" /> }
        @case ('star') {
          <path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z" />
        }
        @case ('shield') {
          <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /><path d="M8.5 12l2.5 2.5 4.5-5" />
        }
        @case ('close') { <path d="M6 6l12 12M18 6L6 18" /> }
        @case ('eye') { <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /> }
        @case ('eye-off') {
          <path d="M3 3l18 18M10.6 5.1A10.4 10.4 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-2.8 3.7M6.2 6.3C3.6 8 2 12 2 12s3.6 7 10 7a9.6 9.6 0 0 0 4.3-1M9.9 9.9a3 3 0 0 0 4.2 4.2" />
        }
        @case ('logout') { <path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10" /> }
        @case ('info') { <circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /> }
        @case ('compare') { <path d="M8 4v16M16 4v16M4 8h8M12 16h8" /> }
        @case ('briefcase') { <rect x="3.5" y="7" width="17" height="12.5" rx="2" /><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M3.5 12.5h17" /> }
        @case ('document') { <path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5M10 13h6M10 17h6" /> }
        @case ('trend') { <path d="M4 17l5.5-5.5 4 4L20 9" /><path d="M15 9h5v5" /> }
        @case ('users') {
          <circle cx="9" cy="8.5" r="3.5" />
          <path d="M2.5 20c1-3.6 3.6-5.5 6.5-5.5s5.5 1.9 6.5 5.5M16 5.2a3.5 3.5 0 0 1 0 6.6M18 14.8c1.7.7 2.9 2.4 3.5 5.2" />
        }
        @case ('message') {
          <path d="M5 5h14a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 17h-8l-4.5 3.5V17H5a1.5 1.5 0 0 1-1.5-1.5v-9A1.5 1.5 0 0 1 5 5z" />
        }
        @case ('pencil') { <path d="M4 20l1-4.5L15.5 5a2.1 2.1 0 0 1 3 3L8 18.5z" /><path d="M13.5 7l3 3" /> }
        @case ('external') { <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /> }
        @case ('check-circle') { <circle cx="12" cy="12" r="9" /><path d="M8 12.3l2.8 2.7L16 9.5" /> }
        @case ('alert') { <path d="M12 4l9 16H3z" /><path d="M12 10v4.5M12 17.5h.01" /> }
        @case ('pause') { <circle cx="12" cy="12" r="9" /><path d="M10 9v6M14 9v6" /> }
        @case ('swap') { <path d="M7 7h12l-3.5-3.5M17 17H5l3.5 3.5" /> }
        @case ('map') { <path d="M9 4L3.5 6v14L9 18l6 2 5.5-2V4L15 6z" /><path d="M9 4v14M15 6v14" /> }
        @case ('send') { <path d="M20.5 3.5L10 14M20.5 3.5L14 20.5l-4-6.5-6.5-4z" /> }
        @case ('hourglass') { <path d="M7 3h10M7 21h10M8 3c0 4.5 8 5.5 8 9s-8 4.5-8 9M16 3c0 4.5-8 5.5-8 9" /> }
      }
    </svg>
  `,
})
export class Icon {
  readonly name = input.required<IconName>();
  readonly size = input(16);
  readonly stroke = input(2.2);
}
