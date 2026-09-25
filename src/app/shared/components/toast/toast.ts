import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ToastService } from '../../../core/services/toast.service';
import { Icon } from '../icon/icon';

/** Toast global. Mobile: arriba a lo ancho. Desktop: abajo al centro. */
@Component({
  selector: 'app-toast',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div aria-live="polite" role="status">
      @if (toast.message(); as message) {
        <div
          class="fixed inset-x-3.5 top-[max(14px,env(safe-area-inset-top))] z-[80] flex animate-fade-in items-center gap-2.5 rounded-xl bg-ink px-4 py-[13px] text-sm leading-snug font-medium text-white shadow-toast lg:inset-x-auto lg:top-auto lg:bottom-7 lg:left-1/2 lg:max-w-[520px] lg:-translate-x-1/2 lg:px-[18px]"
        >
          <span class="flex size-[22px] shrink-0 items-center justify-center rounded-full bg-success">
            <app-icon name="check" [size]="12" [stroke]="3.2" />
          </span>
          {{ message }}
        </div>
      }
    </div>
  `,
})
export class Toast {
  protected readonly toast = inject(ToastService);
}
