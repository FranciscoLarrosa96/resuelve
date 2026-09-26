import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Sello verde de "perfil verificado" que acompaña al nombre. */
@Component({
  selector: 'app-verified-seal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex shrink-0' },
  template: `
    <svg [attr.width]="size()" [attr.height]="size()" viewBox="0 0 24 24" role="img" aria-label="Perfil verificado">
      <path fill="#1A5C4D"
        d="M12 2l2.4 2.1 3.2-.3.9 3.1 2.8 1.6-1.1 3 1.1 3-2.8 1.6-.9 3.1-3.2-.3L12 22l-2.4-2.1-3.2.3-.9-3.1-2.8-1.6 1.1-3-1.1-3 2.8-1.6.9-3.1 3.2.3z" />
      <path d="M8.5 12.2l2.4 2.4 4.6-4.8" stroke="#fff" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  `,
})
export class VerifiedSeal {
  readonly size = input(15);
}
