import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CurrentRoute } from '../../core/services/current-route.service';
import { Icon, IconName } from '../../shared/components/icon/icon';

export interface MobileNavItem {
  label: string;
  link: string;
  icon: IconName;
  /** Rutas (prefijos) donde el ítem se marca activo. */
  activeOn: string[];
  badge?: number;
}

/** Barra de navegación inferior (mobile y tablet, < lg). */
@Component({
  selector: 'app-mobile-nav',
  imports: [RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block lg:hidden' },
  template: `
    <nav
      class="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white px-1.5 pt-2"
      [attr.aria-label]="label()"
    >
      <div class="mx-auto grid max-w-xl grid-cols-4">
        @for (item of items(); track item.link) {
          <a
            [routerLink]="item.link"
            class="relative flex flex-col items-center gap-1 rounded-xl py-1.5 text-[11.5px] font-semibold transition-colors"
            [class]="isActive(item) ? 'text-brand' : 'text-muted'"
            [attr.aria-current]="isActive(item) ? 'page' : null"
          >
            <app-icon [name]="item.icon" [size]="22" [stroke]="2" />
            {{ item.label }}
            @if (item.badge) {
              <span
                class="absolute top-0.5 left-[55%] h-4.5 min-w-4.5 rounded-full bg-accent px-1.25 text-center text-[10.5px] leading-4.5 font-bold text-white"
              >{{ item.badge }}</span>
            }
          </a>
        }
      </div>
    </nav>
  `,
})
export class MobileNav {
  private readonly route = inject(CurrentRoute);

  readonly items = input.required<MobileNavItem[]>();
  readonly label = input('Navegación');

  protected isActive(item: MobileNavItem): boolean {
    return this.route.matches(...item.activeOn);
  }
}
