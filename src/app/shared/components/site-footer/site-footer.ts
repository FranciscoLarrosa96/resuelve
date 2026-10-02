import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icon } from '../icon/icon';
import { Logo } from '../logo/logo';

@Component({
  selector: 'app-site-footer',
  imports: [RouterLink, Icon, Logo],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (compact()) {
      <!-- Workspace: una línea legal discreta, sin el bloque institucional. -->
      <footer
        class="mt-12 flex flex-wrap items-center justify-between gap-x-6 gap-y-1 border-t border-line-soft py-4 text-sm text-muted"
        [class]="mobileNav() ? 'max-lg:pb-21' : ''"
      >
        <span>Resuelve · Tandil, Argentina</span>
        <nav aria-label="Enlaces legales" class="flex gap-5">
          <a routerLink="/terminos" class="inline-flex min-h-10 items-center underline-offset-4 hover:text-brand hover:underline">Términos de Uso</a>
          <a routerLink="/privacidad" class="inline-flex min-h-10 items-center underline-offset-4 hover:text-brand hover:underline">Política de Privacidad</a>
        </nav>
      </footer>
    } @else {
    <footer class="bg-primary-deep text-on-brand" [class]="mobileNav() ? 'max-lg:pb-21' : ''">
      <div class="mx-auto max-w-[1800px] px-5 py-8 md:px-[clamp(20px,4vw,72px)] md:py-10">
        <div class="grid gap-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-8">
          <div class="flex flex-col items-start gap-2">
            <app-logo tone="on-brand" />
            <p class="max-w-sm text-sm leading-relaxed text-on-brand-muted">Profesionales locales para resolver lo que necesitás.</p>
          </div>
          <nav aria-label="Enlaces del pie" class="flex flex-col items-start gap-1 sm:flex-row sm:flex-wrap sm:gap-x-6 sm:gap-y-1 md:justify-end">
            <a routerLink="/terminos" class="inline-block min-h-10 py-2 text-sm font-medium text-on-brand underline-offset-4 transition-colors hover:text-white hover:underline">Términos de Uso</a>
            <a routerLink="/privacidad" class="inline-block min-h-10 py-2 text-sm font-medium text-on-brand underline-offset-4 transition-colors hover:text-white hover:underline">Política de Privacidad</a>
          </nav>
        </div>
        <div class="mt-4 flex flex-col gap-1.5 border-t border-white/15 pt-4 text-xs text-on-brand-muted sm:mt-5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <span>Tandil · Argentina</span>
          <a href="https://franciscolarrosa.com.ar" target="_blank" rel="noopener noreferrer" class="inline-flex min-h-10 w-fit items-center gap-1 font-medium text-on-brand underline-offset-4 transition-colors hover:text-white hover:underline">
            Designed by Francisco Larrosa <app-icon name="external" [size]="13" />
          </a>
        </div>
      </div>
    </footer>
    }
  `,
})
export class SiteFooter {
  readonly mobileNav = input(false);
  /** Versión de una línea para áreas de trabajo. */
  readonly compact = input(false);
}
