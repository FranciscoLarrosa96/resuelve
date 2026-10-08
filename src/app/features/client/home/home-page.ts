import { NotificationBell } from '../../../shared/components/notification-bell/notification-bell';
import { RevealDirective } from '../../../shared/directives/reveal.directive';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  Injector,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  CITY,
  FEATURED_SERVICE_SLUGS,
  homeExamples,
  TRUST_POINTS,
  TYPICAL_JOBS_BY_SERVICE,
} from '../../../core/data/catalog.data';
import { Service } from '../../../core/models/category';
import { ProfessionalSummary } from '../../../core/models/professional';
import { AuthStore } from '../../../core/state/auth.store';
import { CatalogStore } from '../../../core/state/catalog.store';
import { HomeProfessionalsStore } from '../../../core/state/home-professionals.store';
import { proModeBadge } from '../../../core/state/pro-mode-badge';
import { RequestStore } from '../../../core/state/request.store';
import { SearchStore } from '../../../core/state/search.store';
import { SpeechInput } from '../../../core/services/speech-input.service';
import { CatalogError } from '../../../shared/components/catalog-error/catalog-error';
import { Icon } from '../../../shared/components/icon/icon';
import { ServiceIcon } from '../../../shared/components/icon/service-icon';
import { Logo } from '../../../shared/components/logo/logo';
import { ModeSwitch } from '../../../shared/components/mode-switch/mode-switch';
import { ProShowcase } from './pro-showcase';
import { ResultCard } from '../results/result-card/result-card';
import { searchServices } from '../../../core/utils/catalog-search';

@Component({
  selector: 'app-home-page',
  imports: [
    NotificationBell,
    RevealDirective,
    RouterLink,
    CatalogError,
    Icon,
    Logo,
    ModeSwitch,
    ProShowcase,
    ServiceIcon,
    ResultCard,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './home-page.html',
  styleUrl: './home-page.css',
})
export class HomePage {
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly search = inject(SearchStore);
  protected readonly request = inject(RequestStore);
  protected readonly catalog = inject(CatalogStore);
  protected readonly homePros = inject(HomeProfessionalsStore);
  protected readonly auth = inject(AuthStore);
  /** Quien ya es profesional no ve "Soy profesional". */
  protected readonly isPro = computed(() => !!this.auth.user()?.professionalProfileId);
  protected readonly proPending = proModeBadge();

  protected readonly city = CITY;
  protected readonly examples = computed(() => homeExamples(this.catalog.popularSlugs()));
  protected readonly skeletons = FEATURED_SERVICE_SLUGS.map((_, i) => i);

  /** Selección editorial del frontend; nombre, id y matrícula salen de la API. */
  protected readonly featured = computed(() =>
    FEATURED_SERVICE_SLUGS.map((slug) => this.catalog.serviceBySlug(slug)).filter(
      (s): s is Service => !!s,
    ),
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
  protected readonly generalFilters = [
    { key: 'all', label: 'Todos' },
    { key: 'available', label: 'Disponibles hoy' },
    { key: 'work', label: 'Con trabajos en Resuelve' },
  ] as const;
  protected readonly generalFilter = signal<(typeof this.generalFilters)[number]['key']>('all');
  /** Exclusión y filtros solo en esta vista: el catálogo y su orden siguen completos. */
  protected readonly generalCandidates = computed(() => {
    const showcased = new Set(this.homePros.proShowcase().map((item) => item.pro.id));
    return this.homePros.generalCandidates().filter((item) => !showcased.has(item.pro.id));
  });
  protected readonly generalVisible = computed(() => {
    const filter = this.generalFilter();
    return this.generalCandidates()
      .filter(
        (item) =>
          filter === 'all' ||
          (filter === 'available' && item.pro.availableToday) ||
          (filter === 'work' && item.pro.completedJobsCount > 0),
      )
      .slice(0, 3);
  });
  /** Reserva el espacio de la vitrina mientras carga, y lo oculta si falla o no hay perfiles. */
  protected readonly showcasePending = computed(
    () => !this.homePros.loaded() && !this.homePros.availableError(),
  );
  protected readonly hasShowcaseLayout = computed(
    () => this.hasShowcase() || this.showcasePending(),
  );
  protected readonly urgentText = computed(() => {
    const n = this.homePros.availableCount();
    if (!this.homePros.loaded() || !n) return 'Mirá quién puede trabajar hoy';
    return n === 1
      ? `1 profesional disponible hoy en ${CITY}`
      : `${n} profesionales disponibles hoy en ${CITY}`;
  });

  /**
   * Primera pregunta del inicio: "¿Para cuándo?". `urgent` lleva a Urgencias
   * (quién puede hoy), `calm` al pedido de presupuestos de siempre. Si ya había
   * texto del Home (volvió atrás), se abre directo la caja.
   */
  protected readonly mode = signal<'urgent' | 'calm' | null>(null);
  protected readonly focused = signal(false);
  protected readonly submitting = signal(false);
  protected readonly suggestionsDismissed = signal(false);
  protected readonly suggestions = computed(() => {
    const text = this.request.homeText().trim();
    return text.length >= 2 && !this.suggestionsDismissed()
      ? searchServices(this.catalog.activeServices(), this.catalog.categories(), text).slice(0, 4)
      : [];
  });
  protected explore(service: Service): void {
    this.speech.stop();
    this.router.navigate(['/profesionales'], { queryParams: { servicio: service.slug } });
  }
  /** Tocó "Encontrar profesionales" sin escribir nada. */
  protected readonly emptyHint = signal(false);
  protected readonly speech = inject(SpeechInput);

  constructor() {
    if (this.request.homeText().trim()) this.mode.set('calm');
    this.catalog.loadCatalog();
    this.catalog.loadPopular();
    this.homePros.load();
  }

  /** "Tableros · Cortocircuitos · Tomas": trabajos típicos del servicio. */
  protected jobsFor(service: Service): string {
    return (TYPICAL_JOBS_BY_SERVICE[service.slug] ?? []).slice(0, 3).join(' · ');
  }

  protected onInput(event: Event): void {
    this.onText((event.target as HTMLTextAreaElement).value);
  }

  protected onText(text: string): void {
    this.suggestionsDismissed.set(false);
    this.request.setHomeText(text);
    if (text.trim()) this.emptyHint.set(false);
  }

  protected choose(mode: 'urgent' | 'calm'): void {
    this.mode.set(mode);
    afterNextRender(() => this.focusProblem(), { injector: this.injector });
  }

  /** "Cambiar": vuelve a las dos puertas sin borrar lo escrito. */
  protected changeMode(): void {
    this.speech.stop();
    this.emptyHint.set(false);
    this.mode.set(null);
  }

  protected submit(): void {
    if (this.mode() === 'urgent') this.findToday();
    else this.find();
  }

  /**
   * "Ver quién puede hoy": el texto es opcional. Con un servicio reconocido el
   * pedido sigue en Urgencias (`pedido=1` conserva la descripción); sin texto o
   * sin servicio claro, Urgencias arranca con la lista general de hoy.
   */
  private findToday(): void {
    if (this.submitting()) return;
    this.speech.stop();
    const started = this.request.startFromHome();
    if (started) this.request.updateDraft({ urgency: 'URGENT' });
    this.search.resetForNewRequest();
    this.submitting.set(true);
    const extras = started && this.request.hasContext() ? { queryParams: { pedido: 1 } } : {};
    this.router.navigate(['/urgencias'], extras).finally(() => this.submitting.set(false));
  }

  private focusProblem(): void {
    document.querySelectorAll<HTMLTextAreaElement>('textarea[id^="home-problem"]').forEach((t) => {
      if (t.offsetParent) t.focus();
    });
  }

  /** Sin texto no se arma ningún pedido: se pide que lo escriba. */
  protected find(): void {
    if (this.submitting()) return;
    this.speech.stop();
    if (!this.request.startFromHome()) {
      this.emptyHint.set(true);
      this.focusProblem();
      return;
    }
    this.search.resetForNewRequest();
    this.submitting.set(true);
    this.router.navigate(['/solicitud']).finally(() => this.submitting.set(false));
  }

  protected dictate(): void {
    this.speech.toggle(this.request.homeText(), (text) => this.onText(text));
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
