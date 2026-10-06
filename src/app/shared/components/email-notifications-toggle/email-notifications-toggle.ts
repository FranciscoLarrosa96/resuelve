import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { NotificationsApiService } from '../../../core/api/notifications-api.service';
import { ToastService } from '../../../core/services/toast.service';
import { AuthStore } from '../../../core/state/auth.store';

export const EMAIL_NOTIFICATIONS_MESSAGES = {
  on: 'Te vamos a avisar por email.',
  off: 'Listo, no te mandamos más avisos por email.',
  failed: 'No pudimos guardar el cambio. Intentá nuevamente.',
} as const;

/**
 * "Avisos por email" (cliente y profesional, misma cuenta). Se guarda en el
 * backend; si falla, el interruptor vuelve a como estaba. Los avisos dentro de
 * la app no dependen de esto.
 */
@Component({
  selector: 'app-email-notifications-toggle',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <section
      class="rounded-2xl border border-line bg-surface px-4 py-4"
      data-testid="email-notifications"
    >
      <button
        type="button"
        role="switch"
        class="flex min-h-11 w-full items-center gap-3.5 text-left disabled:cursor-wait"
        [attr.aria-checked]="enabled()"
        [attr.aria-busy]="saving()"
        [disabled]="saving()"
        (click)="toggle()"
      >
        <span class="min-w-0 flex-1">
          <span class="block text-[15px] font-semibold text-ink">Avisos por email</span>
          <span class="mt-0.5 block text-[13.5px] leading-[1.4] text-muted">
            Te escribimos cuando tenés una solicitud, un presupuesto o un horario para ver. Nunca incluimos tus datos del pedido.
          </span>
        </span>
        <span
          class="relative h-8 w-13 shrink-0 rounded-full transition-colors duration-200"
          [class]="enabled() ? 'bg-success' : 'bg-line-dash'"
          aria-hidden="true"
        >
          <span
            class="absolute top-[3px] left-[3px] size-6.5 rounded-full bg-knob shadow-knob transition-transform duration-200 ease-(--ease-out-soft)"
            [style.transform]="'translateX(' + (enabled() ? 20 : 0) + 'px)'"
          ></span>
        </span>
      </button>
    </section>
  `,
})
export class EmailNotificationsToggle {
  private readonly auth = inject(AuthStore);
  private readonly api = inject(NotificationsApiService);
  private readonly toast = inject(ToastService);

  protected readonly saving = signal(false);
  protected enabled(): boolean {
    return this.auth.user()?.emailNotifications !== false;
  }

  protected async toggle(): Promise<void> {
    if (this.saving()) return;
    const next = !this.enabled();
    this.saving.set(true);
    try {
      await firstValueFrom(this.api.setEmailPreference(next));
      this.auth.setEmailNotifications(next);
      this.toast.show(next ? EMAIL_NOTIFICATIONS_MESSAGES.on : EMAIL_NOTIFICATIONS_MESSAGES.off);
    } catch {
      this.toast.show(EMAIL_NOTIFICATIONS_MESSAGES.failed, 2800, 'info');
    } finally {
      this.saving.set(false);
    }
  }
}
