import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RequestStatus } from '../../../core/models/request';
import { requestStatusLabel, statusTone } from '../../../core/models/request-status';

/** Estado de una solicitud con su color. Texto y tono salen del mapper único. */
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
  protected readonly tone = computed(() => statusTone(this.status()));
  protected readonly label = computed(() => requestStatusLabel(this.status()));
}
