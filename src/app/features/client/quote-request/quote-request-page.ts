import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { BackNavigation } from '../../../core/services/back-navigation.service';
import { RequestStore } from '../../../core/state/request.store';
import { oneDecimal, photosLabel, pluralize } from '../../../core/utils/format';
import { Avatar } from '../../../shared/components/avatar/avatar';
import { BackButton } from '../../../shared/components/back-button/back-button';
import { Icon } from '../../../shared/components/icon/icon';

@Component({
  selector: 'app-quote-request-page',
  imports: [Avatar, BackButton, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './quote-request-page.html',
})
export class QuoteRequestPage {
  private readonly router = inject(Router);
  private readonly backNav = inject(BackNavigation);
  protected readonly store = inject(RequestStore);

  protected readonly draft = this.store.draft;
  protected readonly recipients = this.store.recipients;
  protected readonly f1 = oneDecimal;

  protected readonly recipientsTitle = computed(() =>
    `Para ${pluralize(this.recipients().length, 'profesional', 'profesionales')}`,
  );

  protected readonly rows = computed(() => {
    const d = this.draft();
    return [
      { key: 'Problema', value: `${d.category} · ${d.title}` },
      { key: 'Urgencia', value: this.store.urgencyLabel() },
      { key: 'Zona', value: d.zone },
      { key: 'Cuándo', value: d.when },
      { key: 'Fotos', value: photosLabel(d.photos, true) },
    ];
  });

  protected readonly photosLong = computed(() => photosLabel(this.draft().photos, true));

  protected readonly etaText = computed(() => {
    const fastest = [...this.recipients()].sort((a, b) => a.responseMinutes - b.responseMinutes)[0];
    return fastest ? `La primera respuesta suele llegar en ${fastest.responseTime.replace('~', '')}.` : '';
  });

  protected readonly sendLabel = computed(() => {
    if (this.store.sending()) return 'Enviando…';
    const list = this.recipients();
    if (!list.length) return 'Elegí un profesional para continuar';
    return list.length === 1 ? `Enviar solicitud a ${list[0].firstName}` : `Enviar solicitud a los ${list.length}`;
  });

  protected back(): void {
    this.backNav.back('/profesionales');
  }

  protected editRequest(): void {
    this.store.goToStep(5);
    this.router.navigate(['/solicitud']);
  }

  protected onComment(event: Event): void {
    this.store.comment.set((event.target as HTMLTextAreaElement).value);
  }

  protected async send(): Promise<void> {
    const sent = await this.store.send();
    if (sent) this.router.navigate(['/presupuesto/enviado'], { replaceUrl: true });
  }
}
