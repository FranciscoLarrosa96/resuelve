import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icon } from '../icon/icon';

@Component({
  selector: 'app-site-footer',
  imports: [RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <footer class="border-t border-line-soft" [class]="mobileNav() ? 'max-lg:pb-21' : ''">
      <div class="mx-auto flex max-w-6xl flex-col gap-2.5 px-4 py-5 text-[13px] text-muted sm:px-6 md:flex-row md:items-center md:justify-between md:gap-5">
        <p class="font-medium">Resuelve · Tandil</p>
        <nav aria-label="Enlaces del pie" class="flex flex-wrap items-center gap-x-5 gap-y-1">
          <a routerLink="/terminos" class="inline-block py-1 font-medium text-ink-soft underline-offset-2 hover:text-ink hover:underline">Términos de Uso</a>
          <a routerLink="/privacidad" class="inline-block py-1 font-medium text-ink-soft underline-offset-2 hover:text-ink hover:underline">Política de Privacidad</a>
          <a href="https://franciscolarrosa.com.ar" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 py-1 font-medium text-ink-soft underline-offset-2 hover:text-ink hover:underline">
            Designed by Francisco Larrosa <app-icon name="external" [size]="13" />
          </a>
        </nav>
      </div>
    </footer>
  `,
})
export class SiteFooter {
  readonly mobileNav = input(false);
}
