import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  CITY,
  FEATURED_SERVICE_SLUGS,
  REQUEST_EXAMPLES,
  TRUST_POINTS,
  TYPICAL_JOBS_BY_SERVICE,
  URGENT_AVAILABLE_NOW,
} from '../../../core/data/catalog.data';
import { FEATURED_IDS, LIVE_NOW_IDS, TRUST_EXAMPLE_ID } from '../../../core/data/professionals.data';
import { Service } from '../../../core/models/category';
import { Professional } from '../../../core/models/professional';
import { ProfessionalsService } from '../../../core/services/professionals.service';
import { CatalogStore } from '../../../core/state/catalog.store';
import { RequestStore } from '../../../core/state/request.store';
import { SearchStore } from '../../../core/state/search.store';
import { oneDecimal } from '../../../core/utils/format';
import { Avatar } from '../../../shared/components/avatar/avatar';
import { CatalogError } from '../../../shared/components/catalog-error/catalog-error';
import { Icon } from '../../../shared/components/icon/icon';
import { Logo } from '../../../shared/components/logo/logo';
import { VerifiedSeal } from '../../../shared/components/verified-seal/verified-seal';

@Component({
  selector: 'app-home-page',
  imports: [RouterLink, Avatar, CatalogError, Icon, Logo, VerifiedSeal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './home-page.html',
})
export class HomePage {
  private readonly router = inject(Router);
  private readonly pros = inject(ProfessionalsService);
  private readonly search = inject(SearchStore);
  protected readonly request = inject(RequestStore);
  protected readonly catalog = inject(CatalogStore);

  protected readonly city = CITY;
  protected readonly examples = REQUEST_EXAMPLES;
  protected readonly skeletons = FEATURED_SERVICE_SLUGS.map((_, i) => i);

  /** Selección editorial del frontend; nombre, id y matrícula salen de la API. */
  protected readonly featured = computed(() =>
    FEATURED_SERVICE_SLUGS.map((slug) => this.catalog.serviceBySlug(slug)).filter((s): s is Service => !!s),
  );
  protected readonly allServicesText = computed(() => {
    if (this.catalog.empty()) return 'Todavía no hay servicios disponibles';
    const services = this.catalog.activeServices().length;
    const categories = this.catalog.activeCategories().length;
    return `${services} servicios en ${categories} ${categories === 1 ? 'categoría' : 'categorías'}`;
  });
  protected readonly trustPoints = TRUST_POINTS;
  protected readonly urgentNow = URGENT_AVAILABLE_NOW;

  protected readonly liveNow = this.pros.many(LIVE_NOW_IDS);
  protected readonly featuredPros = this.pros.many(FEATURED_IDS);
  protected readonly trustPro = this.pros.get(TRUST_EXAMPLE_ID);

  protected readonly focused = signal(false);
  protected readonly photoSlots = computed(() =>
    Array.from({ length: this.request.homePhotos() }, (_, i) => i),
  );
  protected readonly f1 = oneDecimal;

  constructor() {
    this.catalog.loadCatalog();
  }

  /** "Tableros · Cortocircuitos · Tomas": trabajos típicos del servicio. */
  protected jobsFor(service: Service): string {
    return (TYPICAL_JOBS_BY_SERVICE[service.slug] ?? []).slice(0, 3).join(' · ');
  }

  protected onInput(event: Event): void {
    this.request.setHomeText((event.target as HTMLTextAreaElement).value);
  }

  protected find(): void {
    this.request.startFromHome();
    this.search.resetForNewRequest();
    this.router.navigate(['/solicitud']);
  }

  protected pickService(service: Service): void {
    this.request.resetForNewRequest();
    this.search.resetForNewRequest();
    this.request.setService(service);
    this.router.navigate(['/profesionales']);
  }

  protected seeAll(): void {
    this.router.navigate(['/servicios']);
  }

  protected ask(pro: Professional): void {
    this.request.resetForNewRequest();
    this.search.resetForNewRequest();
    this.request.setServiceSlug(pro.serviceSlugs[0]);
    this.request.askProfessionals([pro.id]);
    this.router.navigate(['/presupuesto']);
  }
}
