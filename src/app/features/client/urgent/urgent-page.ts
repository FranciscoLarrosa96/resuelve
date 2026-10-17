import {
  ChangeDetectionStrategy,
  Component,
  PLATFORM_ID,
  DestroyRef,
  OnInit,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { REQUEST_STEPS } from '../../../core/models/service-request';
import { Subscription } from 'rxjs';
import { ProfessionalsApiService } from '../../../core/api/professionals-api.service';
import { URGENT_SERVICE_SLUGS } from '../../../core/data/catalog.data';
import { avatarOf } from '../../../core/models/avatar';
import { Service } from '../../../core/models/category';
import { ProfessionalSummary, contactChannelsOf, coverageText } from '../../../core/models/professional';
import { ContactActions } from '../../../shared/components/contact-actions/contact-actions';
import { CatalogStore } from '../../../core/state/catalog.store';
import { LocalityLink } from '../../../core/state/locality-link';
import { LocalityStore } from '../../../core/state/locality.store';
import { PROFESSIONALS_ERROR } from '../../../core/state/professionals.store';
import { RequestStore } from '../../../core/state/request.store';
import { SearchStore } from '../../../core/state/search.store';
import { oneDecimal, pluralize } from '../../../core/utils/format';
import { Avatar } from '../../../shared/components/avatar/avatar';
import { BackButton } from '../../../shared/components/back-button/back-button';
import { Icon } from '../../../shared/components/icon/icon';
import { LocalityLinkNotice } from '../../../shared/components/locality-link-notice/locality-link-notice';
import { LocalityPicker } from '../../../shared/components/locality-picker/locality-picker';
import { ServicePicker } from '../../../shared/components/service-picker/service-picker';
import { noReviewsText } from '../../../core/utils/reputation';

/**
 * Urgencias: profesionales REALES que atienden urgencias ("Atiendo urgencias", preferencia
 * permanente; GET /professionals?availableToday=true) y cubren la localidad elegida, con
 * servicio opcional. Primero quienes se pueden contactar al toque (WhatsApp o llamadas,
 * lo ordena el backend): el cliente los contacta sin pasar por un pedido, o pide un
 * presupuesto urgente si el profesional recibe solicitudes. "Atiende urgencias" NO es
 * "disponible ahora". Lista propia de la pantalla para no pisar los filtros de /profesionales.
 *
 * Urgencia es un ATRIBUTO del pedido, no una lista de rubros: Cerrajería,
 * Plomería, Electricidad y Gas son solo atajos; "Otro servicio" busca en el
 * catálogo completo del backend. Las reglas de siempre siguen valiendo
 * (matrícula, cobertura, perfil activo): las aplica el backend.
 */
@Component({
  selector: 'app-urgent-page',
  providers: [LocalityLink],
  imports: [Avatar, BackButton, ContactActions, Icon, LocalityLinkNotice, LocalityPicker, RouterLink, ServicePicker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './urgent-page.html',
  styleUrl: './urgent-page.css',
})
export class UrgentPage implements OnInit {
  readonly pedido = input<string>();
  private readonly router = inject(Router);
  private readonly api = inject(ProfessionalsApiService);
  private readonly request = inject(RequestStore);
  private readonly search = inject(SearchStore);
  private readonly catalog = inject(CatalogStore);
  protected readonly locality = inject(LocalityStore);
  /** Ciudad del enlace (`?provincia=&ciudad=`): navegación, nunca la ubicación del pedido. */
  protected readonly localityLink = inject(LocalityLink);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** Atajos (los rubros de urgencia más comunes) que existen en el catálogo real. NO es una lista cerrada. */
  protected readonly services = computed(() =>
    URGENT_SERVICE_SLUGS.map((slug) => this.catalog.serviceBySlug(slug)).filter(
      (s): s is Service => !!s,
    ),
  );
  /**
   * La entrada general siempre empieza sin filtro de servicio. Llegando desde "Es una urgencia" de un
   * pedido en curso (`?pedido=1`), el filtro arranca en el servicio de ESE pedido (ver `ngOnInit`).
   */
  protected readonly selected = signal('');
  /** Se llegó desde un pedido en curso con servicio: su descripción y servicio no se tocan al pasar por acá. */
  protected readonly continuingOrder = computed(
    () => this.pedido() === '1' && this.request.hasContext() && !!this.request.draft().service.slug,
  );
  /** El profesional tocado no ofrece el servicio del pedido: se explica y se elige qué hacer. */
  protected readonly incompatible = signal<ProfessionalSummary | null>(null);
  protected readonly orderServiceName = this.request.serviceName;
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
  protected readonly noReviews = noReviewsText;

  protected readonly list = computed(() =>
    this.items().map((p) => {
      const channels = contactChannelsOf(p);
      return { pro: p, avatar: avatarOf(p), channels, direct: channels.whatsapp || channels.phone };
    }),
  );
  /** Dónde trabaja, dentro de la ciudad que se está mirando. */
  protected coverageOf(p: ProfessionalSummary): string {
    return coverageText(p, this.locality.id(), this.locality.name());
  }

  protected readonly countText = computed(() => {
    if (!this.locality.id()) return 'Elegí tu ciudad para ver quién atiende urgencias';
    if (this.error()) return '';
    if (!this.loaded()) return 'Buscando quién atiende urgencias…';
    return pluralize(this.total(), 'profesional atiende urgencias', 'profesionales atienden urgencias');
  });

  private sub?: Subscription;

  ngOnInit(): void {
    if (this.continuingOrder()) this.selected.set(this.request.draft().service.slug);
  }

  constructor() {
    inject(DestroyRef).onDestroy(() => this.sub?.unsubscribe());
    effect(() => {
      const slug = this.selected();
      const service = this.catalog.serviceBySlug(slug);
      // Otra ciudad = otra búsqueda (la lista anterior no se muestra mientras carga).
      this.locality.id();
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
   * Pedir presupuesto urgente a un profesional.
   * - Con un pedido en curso (`?pedido=1`): se CONSERVAN su descripción y su servicio. Si el profesional
   *   lo ofrece, se sigue con él; si no, se explica y la persona elige otro profesional o cambia
   *   el servicio ella misma (`changeServiceFor`). Nunca se sobrescribe el servicio ni se borra el texto
   *   para hacerlo compatible. El backend sigue validando elegibilidad y urgencias al enviar.
   * - Entrada general: un pedido urgente dirigido limpio. El usuario elige el servicio cuando entró
   *   a la lista general, sin recuperar un borrador antiguo.
   */
  protected askUrgent(pro: ProfessionalSummary): void {
    if (this.continuingOrder()) {
      const serviceId = this.request.draft().service.id;
      if (serviceId && !pro.services.some((service) => service.id === serviceId)) {
        this.incompatible.set(pro);
        if (this.isBrowser) {
          setTimeout(() => {
            const box = document.getElementById('urgent-incompatible');
            box?.scrollIntoView?.({ block: 'center' });
            box?.focus();
          });
        }
        return;
      }
      this.incompatible.set(null);
      this.request.updateDraft({ urgency: 'URGENT' });
      this.request.askProfessionals([pro], 'TARGETED');
      this.router.navigate(['/presupuesto']);
      return;
    }
    const service = this.selectedService();
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

  /** El profesional no ofrece el servicio del pedido y la persona decide cambiarlo: elige entre los que ofrece, sin borrar nada. */
  protected changeServiceFor(pro: ProfessionalSummary): void {
    this.incompatible.set(null);
    this.request.updateDraft({ urgency: 'URGENT' });
    this.request.askProfessionals([pro], 'TARGETED');
    this.request.changingCategory.set(true);
    this.request.goToStep(REQUEST_STEPS.what);
    this.router.navigate(['/solicitud']);
  }

  protected dismissIncompatible(): void {
    this.incompatible.set(null);
  }

  /**
   * Nadie atiende urgencias: se puede crear la solicitud igual y elegir el
   * servicio si todavía no se filtró. Queda como "Necesito resolverlo hoy"
   * y se elige a quién pedirle presupuesto entre los profesionales del
   * servicio: una urgencia solo puede llegar a quien atiende urgencias.
   * Con un pedido en curso se conserva tal cual (descripción y servicio).
   */
  protected createAnyway(): void {
    if (this.continuingOrder()) {
      this.request.updateDraft({ urgency: 'TODAY' });
      this.request.changeProfessional();
      this.router.navigate(['/solicitud']);
      return;
    }
    const service = this.selectedService();
    this.request.resetForNewRequest();
    this.search.resetForNewRequest();
    if (service) this.request.setService(service);
    else this.request.updateDraft({ title: '' });
    this.request.updateDraft({ urgency: 'TODAY', zone: null });
    this.request.changingCategory.set(!service);
    this.router.navigate(['/solicitud']);
  }

  /** Sin urgencias: la búsqueda normal de la ciudad (con el servicio, si eligió uno). */
  protected browseAll(): void {
    const service = this.selectedService();
    this.router.navigate(['/profesionales'], service ? { queryParams: { servicio: service.slug } } : {});
  }

  protected goHome(): void {
    this.router.navigate(['/']);
  }

  private load(service?: Service): void {
    if (!this.isBrowser) return;
    this.sub?.unsubscribe();
    this.items.set([]);
    this.loaded.set(false);
    this.error.set(null);
    const locality = this.locality.id();
    if (!locality) return;
    this.sub = this.api
      .getProfessionals({ locality, service: service?.id, availableToday: true, pageSize: 20 })
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
