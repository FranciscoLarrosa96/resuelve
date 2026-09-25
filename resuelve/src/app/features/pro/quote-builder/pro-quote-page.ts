import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { PRO_STATS, QUOTE_SLOTS, QUOTE_VALIDITIES } from '../../../core/data/pro.data';
import { QuoteDraft } from '../../../core/models/pro';
import { BackNavigation } from '../../../core/services/back-navigation.service';
import { ProStore } from '../../../core/state/pro.store';
import { formatARS, formatThousands, onlyDigits } from '../../../core/utils/format';
import { Avatar } from '../../../shared/components/avatar/avatar';
import { BackButton } from '../../../shared/components/back-button/back-button';
import { Icon } from '../../../shared/components/icon/icon';
import { ChipDirective } from '../../../shared/directives/chip.directive';

@Component({
  selector: 'app-pro-quote-page',
  imports: [RouterLink, Avatar, BackButton, Icon, ChipDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pro-quote-page.html',
})
export class ProQuotePage {
  private readonly router = inject(Router);
  private readonly backNav = inject(BackNavigation);
  protected readonly store = inject(ProStore);

  /** Parámetro de ruta :id */
  readonly id = input.required<string>();

  protected readonly req = computed(() => this.store.byId(this.id()));
  protected readonly quote = this.store.quote;
  protected readonly slots = QUOTE_SLOTS;
  protected readonly validities = QUOTE_VALIDITIES;
  protected readonly stats = PRO_STATS;
  protected readonly ars = formatARS;
  protected readonly thousands = formatThousands;

  protected readonly sendLabel = computed(() =>
    this.store.quoteSending() ? 'Enviando…' : `Enviar presupuesto · ${formatARS(this.store.quoteTotal())}`,
  );

  constructor() {
    this.store.resetQuoteStatus();
  }

  protected setText(field: 'description' | 'notes', event: Event): void {
    this.store.updateQuote({ [field]: (event.target as HTMLTextAreaElement).value } as Partial<QuoteDraft>);
  }

  protected setAmount(field: 'labor' | 'materials', event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = onlyDigits(input.value);
    this.store.updateQuote({ [field]: value } as Partial<QuoteDraft>);
    // Normaliza lo que se ve en el input (separador de miles).
    input.value = formatThousands(value);
  }

  protected send(): void {
    this.store.sendQuote(this.id());
  }

  protected back(): void {
    this.backNav.back(['/pro/solicitudes', this.id()]);
  }

  protected toList(): void {
    this.router.navigate(['/pro/solicitudes']);
  }
}
