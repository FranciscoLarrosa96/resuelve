import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { formatCount } from '../../../core/utils/format';
import { JourneyRow } from '../../../core/utils/month-analytics';

/**
 * Embudo horizontal de Tu mes: una fila por paso, todas sobre el mismo eje
 * lineal; la sombra detrás de cada barra es el paso anterior (lo que se cayó).
 */
@Component({
  selector: 'app-month-journey',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './month-journey.html',
  styleUrl: './month-journey.css',
})
export class MonthJourney {
  readonly journey = input.required<{
    rows: JourneyRow[];
    axis: { max: number; ticks: number[] };
  }>();
  protected readonly count = formatCount;
}
