import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { newsLabel } from '../../../core/utils/badges';
import { Icon } from '../icon/icon';

export type AppMode = 'client' | 'pro';

/**
 * Cambio de modo de una misma cuenta: "Cliente | Profesional". Control
 * segmentado con el modo actual marcado (aria-current) y el otro como link.
 * Solo para quien ya tiene perfil profesional: sin perfil se ofrece
 * "Soy profesional", nunca este control.
 */
@Component({
  selector: 'app-mode-switch',
  imports: [RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div
      class="flex rounded-xl border border-line bg-sand p-0.75"
      [class]="block() ? 'w-full' : 'w-fit'"
      role="group"
      aria-label="Modo de uso"
    >
      <a
        routerLink="/"
        class="flex items-center justify-center gap-1.5 rounded-[9px] px-3 text-[13.5px] font-semibold whitespace-nowrap transition-[color,background-color,box-shadow] duration-150"
        [class]="(block() ? 'h-8.5 flex-1 ' : 'h-8 ') + (mode() === 'client' ? 'bg-surface text-ink shadow-tab' : 'text-muted hover:text-ink')"
        [attr.aria-current]="mode() === 'client' ? 'true' : null"
        [attr.aria-label]="mode() === 'client' ? 'Modo cliente (actual)' : 'Cambiar a modo cliente'"
      >
        <app-icon name="user" [size]="15" [stroke]="2.1" [class]="mode() === 'client' ? 'text-brand' : ''" />Cliente
      </a>
      <a
        routerLink="/pro/dashboard"
        class="relative flex items-center justify-center gap-1.5 rounded-[9px] px-3 text-[13.5px] font-semibold whitespace-nowrap transition-[color,background-color,box-shadow] duration-150"
        [class]="(block() ? 'h-8.5 flex-1 ' : 'h-8 ') + (mode() === 'pro' ? 'bg-surface text-ink shadow-tab' : 'text-muted hover:text-ink')"
        [attr.aria-current]="mode() === 'pro' ? 'true' : null"
        [attr.aria-label]="proLabel()"
      >
        <app-icon name="briefcase" [size]="15" [stroke]="2.1" [class]="mode() === 'pro' ? 'text-brand' : ''" />Profesional
        @if (mode() === 'client' && badge()) {
          <span class="rounded-full bg-accent-fill px-1.5 py-0.5 text-[10.5px] leading-none font-bold text-white tabular-nums" aria-hidden="true">{{ badge() }}</span>
        }
      </a>
    </div>
  `,
})
export class ModeSwitch {
  /** Modo en el que está la pantalla actual. */
  readonly mode = input.required<AppMode>();
  /** Lo que espera en modo profesional (solo se muestra desde el modo cliente). */
  readonly badge = input(0);
  /** Ocupa todo el ancho disponible (sidebar). */
  readonly block = input(false);

  protected readonly proLabel = computed(() => {
    if (this.mode() === 'pro') return 'Modo profesional (actual)';
    return this.badge() ? newsLabel(this.badge(), 'Modo profesional') : 'Cambiar a modo profesional';
  });
}
