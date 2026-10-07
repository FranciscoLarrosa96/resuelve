import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { PushNotifications } from '../../../core/pwa/push-notifications.service';
import { PwaInstall } from '../../../core/pwa/pwa-install.service';
import { ToastService } from '../../../core/services/toast.service';

export const PUSH_MESSAGES = {
  on: 'Listo: te vamos a avisar en este dispositivo.',
  off: 'Listo, no te mandamos más avisos a este dispositivo.',
  blocked: 'Las notificaciones están bloqueadas en este navegador.',
  failed: 'No pudimos activar los avisos. Intentá nuevamente.',
} as const;

/**
 * "Avisos en este dispositivo" (Mi perfil). Es por navegador, no por cuenta:
 * en cada celular o compu se activa aparte. Solo aparece si el servidor manda
 * push; si el navegador no puede, explica por qué (bloqueado, iPhone sin instalar).
 */
@Component({
  selector: 'app-push-notifications-toggle',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (visible()) {
      <section class="rounded-2xl border border-line bg-surface px-4 py-4" data-testid="push-notifications">
        @if (push.state() === 'on' || push.state() === 'off') {
          <button
            type="button"
            role="switch"
            class="flex min-h-11 w-full items-center gap-3.5 text-left disabled:cursor-wait"
            [attr.aria-checked]="push.state() === 'on'"
            [attr.aria-busy]="push.busy()"
            [disabled]="push.busy()"
            (click)="toggle()"
          >
            <span class="min-w-0 flex-1">
              <span class="block text-[15px] font-semibold text-ink">Avisos en este dispositivo</span>
              <span class="mt-0.5 block text-[13.5px] leading-[1.4] text-muted">
                Te avisamos al instante, aunque tengas la app cerrada, cuando tenés una solicitud, un presupuesto o un horario para ver. De 23 a 8 esperan a la mañana.
              </span>
            </span>
            <span
              class="relative h-8 w-13 shrink-0 rounded-full transition-colors duration-200"
              [class]="push.state() === 'on' ? 'bg-success' : 'bg-line-dash'"
              aria-hidden="true"
            >
              <span
                class="absolute top-[3px] left-[3px] size-6.5 rounded-full bg-knob shadow-knob transition-transform duration-200 ease-(--ease-out-soft)"
                [style.transform]="'translateX(' + (push.state() === 'on' ? 20 : 0) + 'px)'"
              ></span>
            </span>
          </button>
        } @else {
          <p class="text-[15px] font-semibold text-ink">Avisos en este dispositivo</p>
          <p class="mt-0.5 text-[13.5px] leading-[1.45] text-muted" data-testid="push-help">
            @if (push.state() === 'blocked') {
              Las notificaciones de Resuelve están bloqueadas en este navegador. Para recibir avisos,
              permitilas desde la configuración del sitio (el candado junto a la dirección) y volvé a esta pantalla.
            } @else {
              En iPhone y iPad los avisos funcionan con Resuelve instalada en la pantalla de inicio.
            }
          </p>
          @if (push.state() === 'ios-install') {
            <button
              type="button"
              class="mt-2.5 min-h-11 rounded-xl button-secondary px-4 text-[14.5px] font-semibold"
              (click)="install()"
            >
              Cómo instalar Resuelve
            </button>
          }
        }
      </section>
    }
  `,
})
export class PushNotificationsToggle {
  protected readonly push = inject(PushNotifications);
  private readonly pwa = inject(PwaInstall);
  private readonly toast = inject(ToastService);

  /** Sin push en el servidor o sin soporte posible: no se muestra nada. */
  protected readonly visible = computed(() => !['loading', 'unavailable'].includes(this.push.state()));

  protected async toggle(): Promise<void> {
    if (this.push.state() === 'on') {
      const ok = await this.push.disable();
      if (ok) this.toast.show(PUSH_MESSAGES.off);
      else this.toast.show(PUSH_MESSAGES.failed, 2800, 'info');
      return;
    }
    const result = await this.push.enable();
    if (result === 'on') this.toast.show(PUSH_MESSAGES.on);
    else this.toast.show(result === 'blocked' ? PUSH_MESSAGES.blocked : PUSH_MESSAGES.failed, 2800, 'info');
  }

  protected install(): void {
    void this.pwa.install();
  }
}
