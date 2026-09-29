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
import { ProfessionalSummary, coverageText } from '../../../core/models/professional';
import { AuthStore } from '../../../core/state/auth.store';
import { CatalogStore } from '../../../core/state/catalog.store';
import { HomeProfessionalsStore } from '../../../core/state/home-professionals.store';
import { proModeBadge } from '../../../core/state/pro-mode-badge';
import { RequestStore } from '../../../core/state/request.store';
import { SearchStore } from '../../../core/state/search.store';
import { SpeechInput } from '../../../core/services/speech-input.service';
import { oneDecimal } from '../../../core/utils/format';
import { Avatar } from '../../../shared/components/avatar/avatar';
import { CatalogError } from '../../../shared/components/catalog-error/catalog-error';
import { Icon } from '../../../shared/components/icon/icon';
import { ServiceIcon } from '../../../shared/components/icon/service-icon';
import { Logo } from '../../../shared/components/logo/logo';
import { VerifiedSeal } from '../../../shared/components/verified-seal/verified-seal';
import { ModeSwitch } from '../../../shared/components/mode-switch/mode-switch';
import { ProShowcase } from './pro-showcase';
import { ProBadge } from '../../../shared/components/plan-badges/plan-badges';

@Component({
  selector: 'app-home-page',
  imports: [RouterLink, Avatar, CatalogError, Icon, Logo, VerifiedSeal, ModeSwitch, ProShowcase, ProBadge, ServiceIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './home-page.html',
})
export class HomePage {
  private readonly router = inject(Router);
  private readonly search = inject(SearchStore);
  protected readonly request = inject(RequestStore);
  protected readonly catalog = inject(CatalogStore);
  protected readonly homePros = inject(HomeProfessionalsStore);
  private readonly auth = inject(AuthStore);
  /** Quien ya es profesional no ve "Soy profesional". */
  protected readonly isPro = computed(() => !!this.auth.user()?.professionalProfileId);
  protected readonly proPending = proModeBadge();

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
  /** Hay perfiles PRO reales para la vitrina (si no, el banner queda solo con la confianza). */
  protected readonly hasShowcase = computed(() => this.homePros.proShowcase().length > 0);
  /** Cantidad real de disponibles hoy (sin números inventados). */
  protected readonly hasAvailable = computed(() => this.homePros.loaded() && this.homePros.availableCount() > 0);
  protected readonly urgentText = computed(() => {
    const n = this.homePros.availableCount();
    if (!this.homePros.loaded() || !n) return 'Mirá quién puede trabajar hoy';
    return n === 1 ? `1 profesional disponible hoy en ${CITY}` : `${n} profesionales disponibles hoy en ${CITY}`;
  });

  protected readonly focused = signal(false);
  /** Tocó "Encontrar profesionales" sin escribir nada. */
  protected readonly emptyHint = signal(false);
  protected readonly speech = inject(SpeechInput);
  protected readonly f1 = oneDecimal;

  constructor() {
    this.catalog.loadCatalog();
    this.homePros.load();
  }

  protected zonesOf(pro: ProfessionalSummary): string {
    return coverageText(pro);
  }

  protected servicesOf(pro: ProfessionalSummary): string {
    return pro.services.map((s) => s.name).join(', ');
  }

  /** "Tableros · Cortocircuitos · Tomas": trabajos típicos del servicio. */
  protected jobsFor(service: Service): string {
    return (TYPICAL_JOBS_BY_SERVICE[service.slug] ?? []).slice(0, 3).join(' · ');
  }

  protected onInput(event: Event): void {
    this.onText((event.target as HTMLTextAreaElement).value);
  }

  protected onText(text: string): void {
    this.request.setHomeText(text);
    if (text.trim()) this.emptyHint.set(false);
  }

  /** Sin texto no se arma ningún pedido: se pide que lo escriba. */
  protected find(): void {
    this.speech.stop();
    if (!this.request.startFromHome()) {
      this.emptyHint.set(true);
      document.querySelectorAll<HTMLTextAreaElement>('textarea[id^="home-problem"]').forEach((t) => {
        if (t.offsetParent) t.focus();
      });
      return;
    }
    this.search.resetForNewRequest();
    this.router.navigate(['/solicitud']);
  }

  protected dictate(): void {
    this.speech.toggle(this.request.homeText(), (text) => this.onText(text));
  }


  protected seeAll(): void {
    this.router.navigate(['/servicios']);
  }

  protected ask(pro: ProfessionalSummary): void {
    this.request.resetForNewRequest();
    this.search.resetForNewRequest();
    const service = this.catalog.activeServices().find((s) => s.id === pro.services[0]?.id);
    if (service) this.request.setService(service);
    this.request.askProfessionals([pro], 'TARGETED');
    this.router.navigate(['/presupuesto']);
  }
}
