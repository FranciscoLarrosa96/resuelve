import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { NotificationsApiService } from '../../../core/api/notifications-api.service';
import { ToastService } from '../../../core/services/toast.service';
import { AuthStore } from '../../../core/state/auth.store';

export const EMAIL_NOTIFICATIONS_MESSAGES = {
  on: 'Guardamos tu preferencia de recibir avisos por email.',
  paused: 'Preferencia guardada. Por ahora el envío de avisos por email está desactivado.',
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
        [attr.aria-busy]="saving() || configLoading()"
        [disabled]="saving() || configLoading()"
        (click)="toggle()"
      >
        <span class="min-w-0 flex-1">
          <span class="block text-[15px] font-semibold text-ink">Avisos por email</span>
          <span class="mt-0.5 block text-[13.5px] leading-[1.4] text-muted">
            Elegí si querés recibir novedades de solicitudes, presupuestos y horarios. Los detalles del pedido quedan en la app.
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
      @if (configLoading()) {
        <p class="mt-2 text-[13.5px] text-muted" role="status">Consultando el envío de avisos…</p>
      } @else if (configError()) {
        <p class="mt-2 text-[13.5px] text-ink-soft" role="status">
          No pudimos comprobar si el envío por email está disponible. Podés revisar las novedades en la app.
          <button type="button" class="min-h-11 px-1 font-semibold text-brand underline" (click)="loadConfig()">Reintentar</button>
        </p>
      } @else if (deliveryEnabled() === false) {
        <p class="mt-2 text-[13.5px] leading-[1.4] text-ink-soft" role="status" data-testid="email-delivery-paused">
          El envío de avisos por email está desactivado. Tu preferencia se conserva para cuando esté disponible.
          Mientras tanto, revisá las novedades en la app.
        </p>
      }
    </section>
  `,
})
export class EmailNotificationsToggle {
  private readonly auth = inject(AuthStore);
  private readonly api = inject(NotificationsApiService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly saving = signal(false);
  protected readonly deliveryEnabled = signal<boolean | null>(null);
  protected readonly configLoading = signal(false);
  protected readonly configError = signal(false);

  constructor() {
    this.loadConfig();
  }

  protected loadConfig(): void {
    this.configLoading.set(true);
    this.configError.set(false);
    this.api.emailConfig().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (config) => {
        this.applyConfig(config.deliveryEnabled);
        this.configLoading.set(false);
      },
      error: () => {
        this.deliveryEnabled.set(null);
        this.configError.set(true);
        this.configLoading.set(false);
      },
    });
  }

  private applyConfig(enabled: unknown): void {
    this.deliveryEnabled.set(typeof enabled === 'boolean' ? enabled : null);
    this.configError.set(typeof enabled !== 'boolean');
  }

  protected enabled(): boolean {
    return this.auth.user()?.emailNotifications !== false;
  }

  protected async toggle(): Promise<void> {
    if (this.saving() || this.configLoading()) return;
    const next = !this.enabled();
    this.saving.set(true);
    try {
      const saved = await firstValueFrom(this.api.setEmailPreference(next));
      this.auth.setEmailNotifications(saved.enabled);
      this.applyConfig(saved.deliveryEnabled);
      this.toast.show(!saved.enabled ? EMAIL_NOTIFICATIONS_MESSAGES.off
        : this.deliveryEnabled() === false ? EMAIL_NOTIFICATIONS_MESSAGES.paused : EMAIL_NOTIFICATIONS_MESSAGES.on);
    } catch {
      this.toast.show(EMAIL_NOTIFICATIONS_MESSAGES.failed, 2800, 'info');
    } finally {
      this.saving.set(false);
    }
  }
}
