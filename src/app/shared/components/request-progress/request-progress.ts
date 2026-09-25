import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RequestStatus } from '../../../core/models/request';
import { requestProgress } from '../../../core/models/request-status';
import { Icon } from '../icon/icon';

/** Progreso discreto de la solicitud (4 pasos, derivado del estado real). */
@Component({
  selector: 'app-request-progress',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (steps(); as list) {
      <ol class="grid grid-cols-4 gap-1.5" aria-label="Progreso de la solicitud">
        @for (s of list; track $index) {
          <li class="flex min-w-0 flex-col gap-1.5" [attr.aria-current]="s.state === 'current' ? 'step' : null">
            <span class="h-1 rounded-full transition-colors duration-300"
              [class]="s.state === 'todo' ? 'bg-line' : s.state === 'current' ? 'bg-accent' : 'bg-brand'"
              aria-hidden="true"></span>
            <span class="flex items-start gap-1 text-[12.5px] leading-[1.25] sm:text-[13px]"
              [class]="s.state === 'todo' ? 'text-muted' : 'font-semibold text-ink'">
              @if (s.state === 'done') {
                <app-icon name="check" [size]="13" [stroke]="3" class="mt-px shrink-0 text-brand" />
              }
              <span class="min-w-0">{{ s.label }}</span>
              <span class="sr-only">{{ s.state === 'done' ? '(hecho)' : s.state === 'current' ? '(paso actual)' : '(pendiente)' }}</span>
            </span>
          </li>
        }
      </ol>
    }
  `,
})
export class RequestProgress {
  readonly status = input.required<RequestStatus>();
  protected readonly steps = computed(() => requestProgress(this.status()));
}
