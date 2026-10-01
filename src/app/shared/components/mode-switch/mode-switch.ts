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
  host: { class: 'block min-w-0' },
  styles: `
    .context-switch {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
    }
    .context-switch a {
      display: flex;
      align-items: center;
      gap: 6px;
      min-height: 44px;
      font-size: 12px;
      color: var(--color-muted);
      transition: color var(--duration-micro) var(--ease-out-soft);
    }
    .context-switch a[aria-current] {
      color: var(--color-brand);
      font-weight: 600;
      order: -1;
    }
    .context-switch a:not([aria-current]) {
      border-left: 1px solid var(--color-line);
      padding-left: 12px;
    }
    .context-switch a:hover {
      color: var(--color-brand);
    }
    .context-switch.full {
      justify-content: space-between;
    }
    .context-switch app-icon {
      flex-shrink: 0;
    }
    @media (max-width: 479px) {
      .context-switch {
        gap: 8px;
      }
      .context-switch a {
        font-size: 11px;
      }
      .context-switch a:not([aria-current]) {
        padding-left: 8px;
      }
    }
  `,
  template: `
    <div class="context-switch" [class.full]="block()" role="group" aria-label="Modo de uso">
      <a
        routerLink="/"
        [attr.aria-current]="mode() === 'client' ? 'true' : null"
        [attr.aria-label]="mode() === 'client' ? 'Modo cliente (actual)' : 'Cambiar a modo cliente'"
      >
        @if (mode() === 'client') {
          <app-icon name="user" [size]="14" />
        }
        Cliente
        @if (mode() !== 'client') {
          <span aria-hidden="true">↗</span>
        }
      </a>
      <a
        routerLink="/pro/dashboard"
        [attr.aria-current]="mode() === 'pro' ? 'true' : null"
        [attr.aria-label]="proLabel()"
      >
        @if (mode() === 'pro') {
          <app-icon name="briefcase" [size]="14" />
        }
        Profesional
        @if (mode() !== 'pro') {
          <span aria-hidden="true">↗</span>
        }
        @if (mode() === 'client' && badge()) {
          <span
            class="rounded-full bg-accent-fill px-1.5 py-0.5 text-[10px] font-bold text-white"
            aria-hidden="true"
            >{{ badge() }}</span
          >
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
    return this.badge()
      ? newsLabel(this.badge(), 'Modo profesional')
      : 'Cambiar a modo profesional';
  });
}
