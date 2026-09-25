import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  ALL_CATEGORIES_TILE,
  CATEGORIES,
  CITY,
  REQUEST_EXAMPLES,
  TRUST_POINTS,
  URGENT_AVAILABLE_NOW,
} from '../../../core/data/catalog.data';
import { FEATURED_IDS, LIVE_NOW_IDS, TRUST_EXAMPLE_ID } from '../../../core/data/professionals.data';
import { Category } from '../../../core/models/category';
import { Professional } from '../../../core/models/professional';
import { ProfessionalsService } from '../../../core/services/professionals.service';
import { RequestStore } from '../../../core/state/request.store';
import { SearchStore } from '../../../core/state/search.store';
import { oneDecimal } from '../../../core/utils/format';
import { Avatar } from '../../../shared/components/avatar/avatar';
import { CheckBadge } from '../../../shared/components/check-badge/check-badge';
import { Icon } from '../../../shared/components/icon/icon';
import { Logo } from '../../../shared/components/logo/logo';
import { VerifiedSeal } from '../../../shared/components/verified-seal/verified-seal';

@Component({
  selector: 'app-home-page',
  imports: [RouterLink, Avatar, CheckBadge, Icon, Logo, VerifiedSeal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './home-page.html',
})
export class HomePage {
  private readonly router = inject(Router);
  private readonly pros = inject(ProfessionalsService);
  private readonly search = inject(SearchStore);
  protected readonly request = inject(RequestStore);

  protected readonly city = CITY;
  protected readonly examples = REQUEST_EXAMPLES;
  protected readonly categories = CATEGORIES;
  protected readonly allTile = ALL_CATEGORIES_TILE;
  protected readonly trustPoints = TRUST_POINTS;
  protected readonly urgentNow = URGENT_AVAILABLE_NOW;

  protected readonly liveNow = this.pros.many(LIVE_NOW_IDS);
  protected readonly featured = this.pros.many(FEATURED_IDS);
  protected readonly trustPro = this.pros.get(TRUST_EXAMPLE_ID);

  protected readonly focused = signal(false);
  protected readonly photoSlots = computed(() =>
    Array.from({ length: this.request.homePhotos() }, (_, i) => i),
  );
  protected readonly f1 = oneDecimal;

  protected onInput(event: Event): void {
    this.request.setHomeText((event.target as HTMLTextAreaElement).value);
  }

  protected find(): void {
    this.request.startFromHome();
    this.search.resetForNewRequest();
    this.router.navigate(['/solicitud']);
  }

  protected pickCategory(category: Category): void {
    this.request.resetForNewRequest();
    this.search.resetForNewRequest();
    this.request.setCategory(category.name);
    this.router.navigate(['/profesionales']);
  }

  protected seeAll(): void {
    this.router.navigate(['/servicios']);
  }

  protected ask(pro: Professional): void {
    this.request.resetForNewRequest();
    this.search.resetForNewRequest();
    this.request.setCategory(pro.services[0].id);
    this.request.askProfessionals([pro.id]);
    this.router.navigate(['/presupuesto']);
  }
}
