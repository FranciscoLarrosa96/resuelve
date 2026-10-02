import {
  ChangeDetectionStrategy,
  Component,
  PLATFORM_ID,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { ProfessionalsApiService } from '../../../core/api/professionals-api.service';
import { URGENT_SERVICE_SLUGS } from '../../../core/data/catalog.data';
import { avatarOf } from '../../../core/models/avatar';
import { Service } from '../../../core/models/category';
import { ProfessionalSummary } from '../../../core/models/professional';
import { CatalogStore } from '../../../core/state/catalog.store';
import { PROFESSIONALS_ERROR } from '../../../core/state/professionals.store';
import { RequestStore } from '../../../core/state/request.store';
import { SearchStore } from '../../../core/state/search.store';
import { oneDecimal, pluralize } from '../../../core/utils/format';
import { Avatar } from '../../../shared/components/avatar/avatar';
import { BackButton } from '../../../shared/components/back-button/back-button';
import { Icon } from '../../../shared/components/icon/icon';
import { ServicePicker } from '../../../shared/components/service-picker/service-picker';

/**
 * Urgencias: profesionales REALES que marcaron "Disponible hoy" para el
 * día (GET /professionals?availableToday=true), con servicio opcional. Lista
 * propia de la pantalla para no pisar los filtros de /profesionales.
 *
 * Urgencia es un ATRIBUTO del pedido, no una lista de rubros: Cerrajería,
 * Plomería, Electricidad y Gas son solo atajos; "Otro servicio" busca en el
 * catálogo completo del backend. Las reglas de siempre siguen valiendo
 * (matrícula, cobertura, perfil activo): las aplica el backend.
 */
@Component({
  selector: 'app-urgent-page',
  imports: [Avatar, BackButton, Icon, RouterLink, ServicePicker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './urgent-page.html',
  styleUrl: './urgent-page.css',
})
export class UrgentPage {
  readonly pedido = input<string>();
  private readonly router = inject(Router);
  private readonly api = inject(ProfessionalsApiService);
  private readonly request = inject(RequestStore);
  private readonly search = inject(SearchStore);
  private readonly catalog = inject(CatalogStore);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** Atajos (los rubros de urgencia más comunes) que existen en el catálogo real. NO es una lista cerrada. */
  protected readonly services = computed(() =>
    URGENT_SERVICE_SLUGS.map((slug) => this.catalog.serviceBySlug(slug)).filter(
      (s): s is Service => !!s,
    ),
  );
  /** La entrada general siempre empieza sin filtro de servicio. */
  protected readonly selected = signal('');
  protected readonly selectedService = computed(() => this.catalog.serviceBySlug(this.selected()));
  /** El elegido no es un atajo: se muestra como filtro propio (activo). */
  protected readonly otherService = computed(() => {
    const s = this.selectedService();
    return s && !URGENT_SERVICE_SLUGS.includes(s.slug) ? s : null;
  });
  /** Buscador del catálogo completo abierto. */
  protected readonly choosingOther = signal(false);
  protected readonly gasWarning = computed(() => this.selected().includes('gas'));
  protected readonly items = signal<ProfessionalSummary[]>([]);
  protected readonly total = signal(0);
  protected readonly loaded = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly f1 = oneDecimal;

  protected readonly list = computed(() =>
    this.items().map((p) => ({ pro: p, avatar: avatarOf(p) })),
  );
  protected readonly countText = computed(() => {
    if (this.error()) return '';
    if (!this.loaded()) return 'Buscando quién está disponible hoy…';
    return pluralize(this.total(), 'profesional disponible hoy', 'profesionales disponibles hoy');
  });

  private sub?: Subscription;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.sub?.unsubscribe());
    effect(() => {
      const slug = this.selected();
      const service = this.catalog.serviceBySlug(slug);
      untracked(() => {
        if (!slug || service) this.load(service);
      });
    });
  }

  protected pick(service: Service): void {
    this.choosingOther.set(false);
    this.selected.set(service.slug);
  }

  protected toggleOther(): void {
    const open = !this.choosingOther();
    this.choosingOther.set(open);
    // Desktop y mobile tienen cada uno su buscador: se enfoca el visible.
    if (open && this.isBrowser) {
      setTimeout(() =>
        [...document.querySelectorAll<HTMLElement>('#urgent-service')]
          .find((e) => e.offsetParent)
          ?.focus(),
      );
    }
  }

  protected showAll(): void {
    this.choosingOther.set(false);
    this.selected.set('');
  }

  protected retry(): void {
    this.load(this.selectedService());
  }

  /**
   * Inicia un pedido urgente dirigido limpio. El usuario elige el servicio
   * cuando entró a la lista general, sin recuperar un borrador antiguo.
   */
  protected askUrgent(pro: ProfessionalSummary): void {
    const selectedService = this.selectedService();
    const current = this.request.service();
    const continuing =
      this.pedido() === '1' &&
      this.request.hasContext() &&
      !!current &&
      (!selectedService || selectedService.id === current.id) &&
      pro.services.some((service) => service.id === current.id);
    if (continuing) {
      this.request.updateDraft({ urgency: 'URGENT' });
      this.request.askProfessionals([pro], 'TARGETED');
      this.router.navigate(['/presupuesto']);
      return;
    }
    const service = selectedService;
    this.request.resetForNewRequest();
    this.search.resetForNewRequest();
    if (service) this.request.setService(service);
    else this.request.updateDraft({ title: '' });
    this.request.updateDraft({ urgency: 'URGENT' });
    this.request.askProfessionals([pro], 'TARGETED');
    this.request.updateDraft({ zone: null });
    this.request.changingCategory.set(!service);
    this.router.navigate(['/solicitud']);
  }

  /**
   * Nadie disponible hoy: se puede crear la solicitud igual y elegir el
   * servicio si todavía no se filtró. Queda como "Necesito resolverlo hoy"
   * y se elige a quién pedirle presupuesto entre los profesionales del
   * servicio: una urgencia solo puede llegar a quien marcó "Disponible hoy".
   */
  protected createAnyway(): void {
    const current = this.request.service();
    const selected = this.selectedService();
    const continuing =
      this.pedido() === '1' &&
      this.request.hasContext() &&
      !!current &&
      (!selected || selected.id === current.id);
    if (continuing) {
      this.request.updateDraft({ urgency: 'TODAY' });
      this.request.changeProfessional();
      this.router.navigate(['/solicitud']);
      return;
    }
    const service = selected;
    this.request.resetForNewRequest();
    this.search.resetForNewRequest();
    if (service) this.request.setService(service);
    else this.request.updateDraft({ title: '' });
    this.request.updateDraft({ urgency: 'TODAY', zone: null });
    this.request.changingCategory.set(!service);
    this.router.navigate(['/solicitud']);
  }

  protected goHome(): void {
    this.router.navigate(['/']);
  }

  private load(service?: Service): void {
    if (!this.isBrowser) return;
    this.sub?.unsubscribe();
    this.loaded.set(false);
    this.error.set(null);
    this.sub = this.api
      .getProfessionals({ service: service?.id, availableToday: true, pageSize: 20 })
      .subscribe({
        next: (res) => {
          this.items.set(res.items);
          this.total.set(res.total);
          this.loaded.set(true);
        },
        error: () => {
          this.items.set([]);
          this.error.set(PROFESSIONALS_ERROR);
        },
      });
  }
}
