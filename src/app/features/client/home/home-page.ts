import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  CITY,
  FEATURED_SERVICE_SLUGS,
  REQUEST_EXAMPLES,
  TRUST_POINTS,
  TYPICAL_JOBS_BY_SERVICE,
} from '../../../core/data/catalog.data';
import { Service } from '../../../core/models/category';
import { ProfessionalSummary } from '../../../core/models/professional';
import { CatalogStore } from '../../../core/state/catalog.store';
import { HomeProfessionalsStore } from '../../../core/state/home-professionals.store';
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
  private readonly search = inject(SearchStore);
  protected readonly request = inject(RequestStore);
  protected readonly catalog = inject(CatalogStore);
  protected readonly homePros = inject(HomeProfessionalsStore);

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
  /** Cantidad real de disponibles hoy (sin números inventados). */
  protected readonly urgentText = computed(() => {
    const n = this.homePros.availableCount();
    if (!this.homePros.loaded() || !n) return 'Mirá quién puede trabajar hoy';
    return n === 1 ? `1 profesional disponible hoy en ${CITY}` : `${n} profesionales disponibles hoy en ${CITY}`;
  });

  protected readonly focused = signal(false);
  protected readonly photoSlots = computed(() =>
    Array.from({ length: this.request.homePhotos() }, (_, i) => i),
  );
  protected readonly f1 = oneDecimal;

  constructor() {
    this.catalog.loadCatalog();
    this.homePros.load();
  }

  protected servicesOf(pro: ProfessionalSummary): string {
    return pro.services.map((s) => s.name).join(', ');
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

  protected ask(pro: ProfessionalSummary): void {
    this.request.resetForNewRequest();
    this.search.resetForNewRequest();
    const service = this.catalog.activeServices().find((s) => s.id === pro.services[0]?.id);
    if (service) this.request.setService(service);
    this.request.askProfessionals([pro]);
    this.router.navigate(['/presupuesto']);
  }
}
