import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RequestStatus } from '../../../core/models/request';
import { RequestStage, STATUS_TONES, requestStatusLabel, statusTone } from '../../../core/models/request-status';

/**
 * Estado de una solicitud con su color. Texto y tono salen del mapper único;
 * con `stage` muestra el estado contextual ("Horario por confirmar").
 */
@Component({
  selector: 'app-status-pill',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-semibold whitespace-nowrap"
      [style.background]="tone().bg"
      [style.color]="tone().fg"
    >
      <span class="size-1.5 rounded-full" [style.background]="tone().dot" aria-hidden="true"></span>{{ label() }}
    </span>
  `,
})
export class StatusPill {
  readonly status = input.required<RequestStatus>();
  readonly stage = input<RequestStage | null>(null);
  protected readonly tone = computed(() => {
    const stage = this.stage();
    return stage ? STATUS_TONES[stage.tone] : statusTone(this.status());
  });
  protected readonly label = computed(() => this.stage()?.label ?? requestStatusLabel(this.status()));
}
