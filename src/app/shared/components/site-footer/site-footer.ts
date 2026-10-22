import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icon } from '../icon/icon';
import { Logo } from '../logo/logo';
import { FOOTER_SERVICE_LINKS } from './footer-services';
import { SOCIAL_LINKS } from './social-links';

@Component({
  selector: 'app-site-footer',
  imports: [RouterLink, Logo, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (compact()) {
      <!-- Workspace: una línea legal discreta, sin el bloque institucional. -->
      <footer
        class="mt-12 flex flex-wrap items-center justify-between gap-x-6 gap-y-1 border-t border-line-soft py-4 text-sm text-muted"
        [class]="mobileNav() ? 'max-lg:pb-21' : ''"
      >
        <span>Resuelve · Argentina</span>
        <nav aria-label="Enlaces legales" class="flex flex-wrap gap-x-5">
          <a routerLink="/terminos" class="inline-flex min-h-10 items-center underline-offset-4 hover:text-brand hover:underline">Términos de Uso</a>
          <a routerLink="/privacidad" class="inline-flex min-h-10 items-center underline-offset-4 hover:text-brand hover:underline">Política de Privacidad</a>
          <a routerLink="/arrepentimiento" class="inline-flex min-h-10 items-center underline-offset-4 hover:text-brand hover:underline">Botón de arrepentimiento</a>
        </nav>
        <ul aria-label="Resuelve en redes" class="flex gap-1">
          @for (social of socialLinks; track social.url) {
            <li>
              <a
                [href]="social.url"
                target="_blank"
                rel="noopener noreferrer"
                [attr.aria-label]="'Resuelve en ' + social.network + ' (se abre en una pestaña nueva)'"
                class="inline-flex size-10 items-center justify-center rounded-full transition-colors hover:text-brand"
              >
                <app-icon [name]="social.icon" [size]="18" />
              </a>
            </li>
          }
        </ul>
      </footer>
    } @else {
    <footer class="bg-primary-deep text-on-brand" [class]="mobileNav() ? 'max-lg:pb-21' : ''">
      <div class="mx-auto max-w-[1800px] px-5 py-10 md:px-[clamp(20px,4vw,72px)] md:py-12">
        <div class="grid gap-8 sm:grid-cols-2 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:gap-x-16 xl:grid-cols-[minmax(0,1.3fr)_auto_minmax(0,1.4fr)_auto]">
          <div class="flex flex-col items-start gap-3 sm:col-span-2 lg:col-span-3 xl:col-span-1">
            <app-logo tone="on-brand" />
            <p class="max-w-xs text-sm leading-relaxed text-on-brand-muted">Profesionales locales para resolver lo que necesitás.</p>
            <ul aria-label="Resuelve en redes" class="mt-1 flex gap-2">
              @for (social of socialLinks; track social.url) {
                <li>
                  <a
                    [href]="social.url"
                    target="_blank"
                    rel="noopener noreferrer"
                    [attr.aria-label]="'Resuelve en ' + social.network + ' (se abre en una pestaña nueva)'"
                    class="inline-flex size-11 items-center justify-center rounded-full border border-white/25 text-on-brand transition-colors hover:border-white/60 hover:bg-white/10 hover:text-white"
                  >
                    <app-icon [name]="social.icon" [size]="20" />
                  </a>
                </li>
              }
            </ul>
          </div>

          <nav aria-labelledby="footer-resuelve">
            <h2 id="footer-resuelve" class="text-xs font-semibold tracking-wide text-on-brand-muted uppercase">Resuelve</h2>
            <ul class="mt-2">
              <li><a routerLink="/profesionales" [class]="linkClass">Buscar profesionales</a></li>
              <li><a routerLink="/urgencias" [class]="linkClass">Urgencias</a></li>
              <li><a routerLink="/trabaja-con-resuelve" [class]="linkClass">Trabajá con Resuelve</a></li>
            </ul>
          </nav>

          <!-- Enlaces fijos (también en el HTML prerenderizado): así los buscadores llegan a las páginas por oficio. -->
          <nav aria-labelledby="footer-services">
            <h2 id="footer-services" class="text-xs font-semibold tracking-wide text-on-brand-muted uppercase">Servicios</h2>
            <ul class="mt-2 grid grid-cols-2 gap-x-6">
              @for (link of serviceLinks; track link.slug) {
                <li>
                  <a [routerLink]="['/servicios', link.slug]" [class]="linkClass">{{ link.label }}</a>
                </li>
              }
              <li>
                <a routerLink="/servicios" [class]="linkClass">Todos los servicios</a>
              </li>
            </ul>
          </nav>

          <nav aria-labelledby="footer-legal">
            <h2 id="footer-legal" class="text-xs font-semibold tracking-wide text-on-brand-muted uppercase">Legal</h2>
            <ul class="mt-2">
              <li><a routerLink="/terminos" [class]="linkClass">Términos de Uso</a></li>
              <li><a routerLink="/privacidad" [class]="linkClass">Política de Privacidad</a></li>
              <li><a routerLink="/arrepentimiento" [class]="linkClass">Botón de arrepentimiento</a></li>
            </ul>
          </nav>
        </div>
        <div class="mt-8 flex flex-col gap-1 border-t border-white/15 pt-5 text-xs text-on-brand-muted sm:flex-row sm:justify-between">
          <span>© {{ year }} Resuelve · Argentina</span>
          <span>Hecho en Tandil</span>
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
  protected readonly serviceLinks = FOOTER_SERVICE_LINKS;
  protected readonly socialLinks = SOCIAL_LINKS;
  protected readonly year = new Date().getFullYear();
  protected readonly linkClass =
    'inline-flex min-h-10 items-center text-sm font-medium text-on-brand underline-offset-4 transition-colors hover:text-white hover:underline';
}
