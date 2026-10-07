import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { PushNotifications } from '../../../core/pwa/push-notifications.service';
import { ToastService } from '../../../core/services/toast.service';
import { Icon } from '../icon/icon';
import { PUSH_MESSAGES } from '../push-notifications-toggle/push-notifications-toggle';

/**
 * Sugerencia del panel profesional: "Activá los avisos para no perderte
 * solicitudes". Solo si se puede activar, nunca se preguntó y no dijo
 * "Ahora no" en los últimos 7 días. El permiso lo pide recién el toque.
 */
@Component({
  selector: 'app-push-suggestion',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (push.shouldSuggest()) {
      <section
        class="mt-4 flex flex-col gap-3 rounded-xl border border-brand-line bg-brand-tint px-4 py-3.5 sm:flex-row sm:items-center"
        aria-labelledby="push-suggestion-title"
        data-testid="push-suggestion"
      >
        <app-icon name="bell" [size]="20" [stroke]="2" class="hidden shrink-0 text-brand sm:block" />
        <div class="min-w-0 flex-1">
          <h2 id="push-suggestion-title" class="text-[15px] font-semibold text-ink">
            Enterate al instante de cada solicitud
          </h2>
          <p class="mt-0.5 text-[13.5px] leading-[1.45] text-ink-soft">
            Activá los avisos en este dispositivo: te llegan aunque tengas la app cerrada.
          </p>
        </div>
        <div class="flex gap-2">
          <button
            type="button"
            class="h-11 rounded-xl px-3.5 text-[14px] font-semibold text-ink-soft hover:bg-brand-soft"
            (click)="push.dismissSuggestion()"
          >
            Ahora no
          </button>
          <button
            type="button"
            class="button-primary h-11 flex-1 rounded-xl px-4 text-[14px] font-semibold disabled:opacity-60 sm:flex-none"
            [disabled]="push.busy()"
            [attr.aria-busy]="push.busy()"
            (click)="enable()"
            data-testid="push-suggestion-enable"
          >
            Activar avisos
          </button>
        </div>
      </section>
    }
  `,
})
export class PushSuggestion {
  protected readonly push = inject(PushNotifications);
  private readonly toast = inject(ToastService);

  protected async enable(): Promise<void> {
    const result = await this.push.enable();
    if (result === 'on') this.toast.show(PUSH_MESSAGES.on);
    else this.toast.show(result === 'blocked' ? PUSH_MESSAGES.blocked : PUSH_MESSAGES.failed, 2800, 'info');
  }
}
