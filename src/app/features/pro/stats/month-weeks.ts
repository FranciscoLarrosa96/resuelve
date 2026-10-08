import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { formatCount, pluralize } from '../../../core/utils/format';
import { WeekChart } from '../../../core/utils/month-analytics';

/** Columnas por semana del mes, con "Hoy" y lo que todavía no pasó rayado (nunca un 0 falso). */
@Component({
  selector: 'app-month-weeks',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './month-weeks.html',
  styleUrl: './month-weeks.css',
})
export class MonthWeeks {
  readonly weeks = input.required<WeekChart>();
  /** "Solicitudes", con su singular y plural para los textos. */
  readonly label = input.required<string>();
  readonly one = input.required<string>();
  readonly many = input.required<string>();
  readonly month = input.required<string>();
  protected readonly count = formatCount;
  protected readonly plural = pluralize;
}
