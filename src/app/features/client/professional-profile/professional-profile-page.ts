import { AcquisitionJourney } from '../../../core/acquisition/acquisition-journey';
import { DestroyRef } from '@angular/core';
import { ProfileSeo } from '../../../core/acquisition/profile-seo';
import { profileSource } from '../../../core/acquisition/public-links';
import { AuthStore } from '../../../core/state/auth.store';
import { ProfileShare } from '../../../shared/components/profile-share/profile-share';
import { RevealDirective } from '../../../shared/directives/reveal.directive';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  untracked,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ExposureTracker } from '../../../core/analytics/exposure-tracker';
import { avatarOf } from '../../../core/models/avatar';
import { ProfessionalDetail, coverageText, hasLicenseFor } from '../../../core/models/professional';
import { BackNavigation } from '../../../core/services/back-navigation.service';
import { ToastService } from '../../../core/services/toast.service';
import { CatalogStore } from '../../../core/state/catalog.store';
import { ProfessionalsStore } from '../../../core/state/professionals.store';
import { RequestStore } from '../../../core/state/request.store';
import { SearchStore } from '../../../core/state/search.store';
import { oneDecimal } from '../../../core/utils/format';
import { Avatar } from '../../../shared/components/avatar/avatar';
import { BackButton } from '../../../shared/components/back-button/back-button';
import { Icon } from '../../../shared/components/icon/icon';
import { ProfileReviews } from './profile-reviews';
import { ProBadge } from '../../../shared/components/plan-badges/plan-badges';
import { NgTemplateOutlet } from '@angular/common';
import { CompareTray } from '../compare/compare-tray';
import { ServiceIcon } from '../../../shared/components/icon/service-icon';
import { CompareDialog } from '../results/compare-dialog/compare-dialog';
import { ComparisonStore } from '../../../core/state/comparison.store';
import { WorkGallery } from '../../../shared/components/work-gallery/work-gallery';
import { SaveProfessional } from '../../../shared/components/save-professional/save-professional';
import { RetentionApiService } from '../../../core/api/retention-api.service';
import { ProfessionalRelationship, unavailableText } from '../../../core/models/retention';
import { signal } from '@angular/core';
import { formatPastDate } from '../../../core/utils/notification-time';

/**
 * Perfil público real (GET /professionals/:id). Solo muestra lo que el
 * backend expone: sin teléfono, email ni dirección, y sin reseñas,
 * fotos de trabajos o métricas de relleno.
 */
@Component({
  selector: 'app-professional-profile-page',
  imports: [
    ProfileShare,
    RevealDirective,
    NgTemplateOutlet,
    RouterLink,
    Avatar,
    BackButton,
    Icon,
    ProfileReviews,
    ProBadge,
    CompareTray,
    CompareDialog,
    ServiceIcon,
    WorkGallery,
    SaveProfessional,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './professional-profile-page.html',
  styleUrl: './professional-profile-page.css',
})
export class ProfessionalProfilePage {
  private readonly router = inject(Router);
  private readonly backNav = inject(BackNavigation);
  private readonly toast = inject(ToastService);
  private readonly exposure = inject(ExposureTracker);
  private readonly catalog = inject(CatalogStore);
  protected readonly pros = inject(ProfessionalsStore);
  protected readonly search = inject(SearchStore);
  protected readonly request = inject(RequestStore);

  /** Parámetro de ruta :id */
  readonly id = input('');
  readonly slug = input('');
  readonly src = input<string>();
  private readonly auth = inject(AuthStore);
  private readonly seo = inject(ProfileSeo);
  private readonly journey = inject(AcquisitionJourney);
  /** Solo un enlace explícito desde resultados de un pedido permite retomarlo. */
  readonly pedido = input<string>();

  /** El perfil cargado corresponde a este :id (evita mostrar el anterior un instante). */
  protected readonly pro = computed(() => {
    const p = this.pros.selected();
    return p && (this.slug() ? p.slug === this.slug() : p.id === this.id()) ? p : null;
  });
  protected readonly avatar = computed(() => {
    const p = this.pro();
    return p ? avatarOf(p) : null;
  });
  private readonly comparison = inject(ComparisonStore);
  protected readonly inComparison = computed(() =>
    this.comparison.selectedIds().includes(this.pro()?.id ?? this.id()),
  );
  /** Matrículas verificadas con el nombre del servicio del catálogo. */
  protected readonly licenses = computed(() =>
    (this.pro()?.verifications.licenses ?? []).map((l) => ({
      service: this.catalog.activeServices().find((s) => s.id === l.serviceId)?.name ?? null,
      reference: l.reference,
    })),
  );
  protected readonly hasVerifications = computed(() => {
    const v = this.pro()?.verifications;
    return !!v && (v.identity || v.phone || v.license);
  });
  /** Se llegó desde un pedido real ("Crear solicitud" → resultados). */
  protected readonly withRequest = computed(
    () => this.pedido() === '1' && this.search.mode() === 'request' && this.request.hasContext(),
  );
  /** Matrícula del servicio buscado: el del pedido, o el filtrado al explorar. */
  protected readonly licenseForRequest = computed(() => {
    const p = this.pro();
    const service = this.withRequest() ? this.request.service() : this.pros.selectedService();
    return !!p && !!service?.requiresLicense && hasLicenseFor(p, service.id);
  });
  protected readonly f1 = oneDecimal;
  protected readonly formatPastDate = formatPastDate;

  private readonly retention = inject(RetentionApiService);
  /** Lo que ESTA persona tiene con el profesional (solo con sesión): trabajos anteriores y "Volver a contratar". */
  protected readonly relationship = signal<ProfessionalRelationship | null>(null);
  protected readonly hired = computed(() => (this.relationship()?.jobsCount ?? 0) > 0);
  protected readonly unavailable = computed(() => {
    const r = this.relationship();
    return r ? unavailableText(r.availability) : null;
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.seo.clear());
    effect(() => {
      const p = this.pro();
      if (p) {
        this.seo.update(p);
        this.journey.capture(profileSource(this.src()));
      }
    });
    effect(() => {
      const slug = this.slug();
      const id = slug || this.id();
      if (id) untracked(() => this.pros.loadDetail(id, false, !!slug));
    });
    // Con sesión: trabajos anteriores con este profesional y si puede volver a contratarlo.
    effect(() => {
      const id = this.pro()?.id;
      const authenticated = this.auth.authenticated();
      untracked(() => {
        this.relationship.set(null);
        if (!id || !authenticated) return;
        this.retention.relationship(id).subscribe({
          next: (r) => this.relationship.set(r),
          error: () => undefined, // sin relación o sin conexión: el perfil se ve igual
        });
      });
    });
    // Visita real al perfil (solo si cargó; la propia y los F5 dentro de 30 min no suman).
    effect(() => {
      const id = this.pro()?.id;
      if (id) untracked(() => this.exposure.profileView(id));
    });
  }

  protected zones(p: ProfessionalDetail): string {
    return coverageText(p);
  }

  protected retry(): void {
    this.pros.loadDetail(this.id(), true);
  }

  protected back(): void {
    this.backNav.back('/profesionales');
  }

  protected ask(): void {
    const p = this.pro();
    if (!p || p.acceptingRequests === false) return;
    if (this.withRequest()) {
      this.search.prepareRequest([p], 'TARGETED', this.request.attributionSource());
      if (!this.auth.authenticated())
        this.router.navigate(['/ingresar'], { queryParams: { returnUrl: '/presupuesto' } });
      else this.router.navigate(['/presupuesto']);
      return;
    }
    this.request.resetForNewRequest();
    this.request.updateDraft({ zone: null, title: '' });
    this.request.askProfessionals([p], 'TARGETED', 'DIRECT_PUBLIC_PROFILE');
    this.request.changingCategory.set(true);
    this.request.acquisitionSource.set(profileSource(this.src()));
    this.request.attributionSource.set(profileSource(this.src()));
    if (!this.auth.authenticated()) {
      this.router.navigate(['/ingresar'], { queryParams: { returnUrl: '/solicitud' } });
      return;
    }
    this.router.navigate(['/solicitud']);
  }

  /** "Volver a contratar": pedido nuevo TARGETED a este profesional (nunca vuelve a discovery). */
  protected rehire(): void {
    const p = this.pro();
    const r = this.relationship();
    if (!p || !r?.canRehire) return;
    this.request.startRehire(p, r.rehireServiceId);
    this.router.navigate(['/solicitud']);
  }

  /** Mismo store que resultados; funciona aunque el perfil se haya abierto por link (sin contexto). */
  protected toggleCompare(): void {
    const p = this.pro();
    if (!p) return;
    if (this.inComparison()) {
      this.comparison.remove(p.id);
    } else if (this.comparison.add(p) && this.comparison.count() === 1) {
      this.toast.show('Agregado para comparar. Sumá al menos otro profesional.');
    }
  }

  protected editRequest(): void {
    this.request.goToStep(4);
    this.router.navigate(['/solicitud']);
  }
}
