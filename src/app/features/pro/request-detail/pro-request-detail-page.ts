import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CLIENT_SUMMARY } from '../../../core/data/pro.data';
import { ProStore } from '../../../core/state/pro.store';
import { formatARS, oneDecimal, photosLabel } from '../../../core/utils/format';
import { BackButton } from '../../../shared/components/back-button/back-button';
import { Icon } from '../../../shared/components/icon/icon';
import { MapMock } from '../../../shared/components/map-mock/map-mock';
import { othersText, urgencyTone } from '../pro-ui';

@Component({
  selector: 'app-pro-request-detail-page',
  imports: [RouterLink, BackButton, Icon, MapMock],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pro-request-detail-page.html',
})
export class ProRequestDetailPage {
  private readonly router = inject(Router);
  protected readonly store = inject(ProStore);

  /** Parámetro de ruta :id */
  readonly id = input.required<string>();

  protected readonly req = computed(() => this.store.byId(this.id()));
  protected readonly photoSlots = computed(() => Array.from({ length: this.req()?.photos ?? 0 }, (_, i) => i));
  protected readonly client = CLIENT_SUMMARY;
  protected readonly tone = urgencyTone;
  protected readonly others = othersText;
  protected readonly photos = photosLabel;
  protected readonly ars = formatARS;
  protected readonly f1 = oneDecimal;

  protected backToList(): void {
    this.router.navigate(['/pro/solicitudes']);
  }

  protected accept(): void {
    this.store.accept(this.id());
    this.backToList();
  }

  protected decline(): void {
    this.store.decline(this.id());
    this.backToList();
  }
}
