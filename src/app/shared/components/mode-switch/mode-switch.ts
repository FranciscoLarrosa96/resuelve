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
    /* Control segmentado: las dos opciones siempre visibles y en el mismo
       lugar; el modo actual va relleno, el otro es un toque directo. */
    .context-switch {
      display: flex;
      align-items: center;
      gap: 2px;
      min-width: 0;
      padding: 3px;
      border: 1px solid var(--color-line);
      border-radius: 999px;
      background: var(--color-surface);
    }
    .context-switch a {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      min-height: 38px;
      padding: 0 14px;
      border-radius: 999px;
      font-size: 13px;
      font-weight: 600;
      white-space: nowrap;
      color: var(--color-muted);
      transition:
        color var(--duration-micro) var(--ease-out-soft),
        background-color var(--duration-micro) var(--ease-out-soft);
    }
    .context-switch a[aria-current] {
      background: var(--color-primary);
      color: var(--color-on-primary);
    }
    .context-switch a:not([aria-current]):hover {
      color: var(--color-brand);
      background: var(--color-brand-tint);
    }
    .context-switch.full {
      display: grid;
      grid-template-columns: 1fr 1fr;
    }
    .context-switch app-icon {
      flex-shrink: 0;
    }
    @media (max-width: 479px) {
      .context-switch a {
        padding: 0 8px;
        font-size: 12px;
      }
      /* Sin ícono en teléfonos angostos (header con logo + campana); el
         bloque a todo el ancho sí lo conserva. */
      .context-switch:not(.full) app-icon {
        display: none;
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
        <app-icon name="user" [size]="14" />
        Cliente
      </a>
      <a
        routerLink="/pro/dashboard"
        [attr.aria-current]="mode() === 'pro' ? 'true' : null"
        [attr.aria-label]="proLabel()"
      >
        <app-icon name="briefcase" [size]="14" />
        Profesional
        @if (mode() === 'client' && badge()) {
          <span
            class="rounded-full bg-accent-fill px-1.5 py-0.5 text-[12px] leading-none font-bold text-white tabular-nums"
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
