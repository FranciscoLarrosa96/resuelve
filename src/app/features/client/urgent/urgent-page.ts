import { ChangeDetectionStrategy, Component, PLATFORM_ID, computed, effect, inject, signal, untracked } from '@angular/core';
import { NgTemplateOutlet, isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
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
import { ChipDirective } from '../../../shared/directives/chip.directive';
import { ServicePicker } from '../../../shared/components/service-picker/service-picker';

/**
 * Urgencias: profesionales REALES que marcaron "Disponible hoy" para el
 * servicio (GET /professionals?service=<id>&availableToday=true). Lista
 * propia de la pantalla para no pisar los filtros de /profesionales.
 *
 * Urgencia es un ATRIBUTO del pedido, no una lista de rubros: Cerrajería,
 * Plomería, Electricidad y Gas son solo atajos; "Otro servicio" busca en el
 * catálogo completo del backend. Las reglas de siempre siguen valiendo
 * (matrícula, cobertura, perfil activo): las aplica el backend.
 */
@Component({
  selector: 'app-urgent-page',
  imports: [NgTemplateOutlet, Avatar, BackButton, ChipDirective, Icon, ServicePicker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './urgent-page.html',
})
export class UrgentPage {
  private readonly router = inject(Router);
  private readonly api = inject(ProfessionalsApiService);
  private readonly request = inject(RequestStore);
  private readonly search = inject(SearchStore);
  private readonly catalog = inject(CatalogStore);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** Atajos (los rubros de urgencia más comunes) que existen en el catálogo real. NO es una lista cerrada. */
  protected readonly services = computed(() =>
    URGENT_SERVICE_SLUGS.map((slug) => this.catalog.serviceBySlug(slug)).filter((s): s is Service => !!s),
  );
  /** Slug elegido: el del pedido en curso (cualquier servicio); si no hay, Plomería. Nunca se cambia solo. */
  protected readonly selected = signal(this.request.draft().service.slug || 'plomeria');
  protected readonly selectedService = computed(() => this.catalog.serviceBySlug(this.selected()));
  /** El elegido no es un atajo: se muestra como chip propio (activo). */
  protected readonly otherService = computed(() => {
    const s = this.selectedService();
    return s && !URGENT_SERVICE_SLUGS.includes(s.slug) ? s : null;
  });
  /** Buscador del catálogo completo abierto. */
  protected readonly choosingOther = signal(false);
  protected readonly items = signal<ProfessionalSummary[]>([]);
  protected readonly total = signal(0);
  protected readonly loaded = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly f1 = oneDecimal;

  protected readonly list = computed(() => this.items().map((p) => ({ pro: p, avatar: avatarOf(p) })));
  protected readonly countText = computed(() => {
    if (this.error()) return '';
    if (!this.loaded()) return 'Buscando quién está disponible hoy…';
    return pluralize(this.total(), 'profesional disponible hoy', 'profesionales disponibles hoy');
  });

  private sub?: Subscription;

  constructor() {
    effect(() => {
      const service = this.catalog.serviceBySlug(this.selected());
      untracked(() => service && this.load(service));
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
        [...document.querySelectorAll<HTMLElement>('#urgent-service-d, #urgent-service-m')].find((e) => e.offsetParent)?.focus(),
      );
    }
  }

  protected retry(): void {
    const service = this.catalog.serviceBySlug(this.selected());
    if (service) this.load(service);
  }

  /**
   * Arma un pedido urgente DIRIGIDO a ese profesional y lleva a "Solicitar
   * presupuesto". Si ya había un pedido de este mismo servicio (vino desde
   * "Crear solicitud"), se conserva lo que escribió.
   */
  protected askUrgent(pro: ProfessionalSummary): void {
    const service = this.selectedService();
    const keep = this.request.hasContext() && !!service && this.request.draft().service.slug === service.slug;
    if (!keep) {
      this.request.resetForNewRequest();
      this.search.resetForNewRequest();
      if (service) this.request.setService(service);
    }
    this.request.updateDraft({ urgency: 'URGENT' });
    this.request.askProfessionals([pro], 'TARGETED');
    this.router.navigate(['/presupuesto']);
  }

  /**
   * Nadie disponible hoy: se puede crear la solicitud igual, para ese MISMO
   * servicio (nunca se cambia por otro). Queda como "Necesito resolverlo hoy"
   * y se elige a quién pedirle presupuesto entre los profesionales del
   * servicio: una urgencia solo puede llegar a quien marcó "Disponible hoy".
   */
  protected createAnyway(): void {
    const service = this.selectedService();
    if (!service) return;
    const keep = this.request.hasContext() && this.request.draft().service.slug === service.slug;
    if (!keep) {
      this.request.resetForNewRequest();
      this.search.resetForNewRequest();
      this.request.setService(service);
    }
    this.request.updateDraft({ urgency: 'TODAY' });
    this.request.changeProfessional();
    this.router.navigate(['/solicitud']);
  }

  protected goHome(): void {
    this.router.navigate(['/']);
  }

  private load(service: Service): void {
    if (!this.isBrowser) return;
    this.sub?.unsubscribe();
    this.loaded.set(false);
    this.error.set(null);
    this.sub = this.api.getProfessionals({ service: service.id, availableToday: true, pageSize: 20 }).subscribe({
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
