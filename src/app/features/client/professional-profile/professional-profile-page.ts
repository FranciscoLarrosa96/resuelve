import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ExposureTracker } from '../../../core/analytics/exposure-tracker';
import { avatarOf } from '../../../core/models/avatar';
import { PortfolioItem, ProfessionalDetail, coverageText, hasLicenseFor } from '../../../core/models/professional';
import { BackNavigation } from '../../../core/services/back-navigation.service';
import { ToastService } from '../../../core/services/toast.service';
import { CatalogStore } from '../../../core/state/catalog.store';
import { ProfessionalsStore } from '../../../core/state/professionals.store';
import { RequestStore } from '../../../core/state/request.store';
import { SearchStore } from '../../../core/state/search.store';
import { oneDecimal } from '../../../core/utils/format';
import { Avatar } from '../../../shared/components/avatar/avatar';
import { BackButton } from '../../../shared/components/back-button/back-button';
import { CheckBadge } from '../../../shared/components/check-badge/check-badge';
import { Icon } from '../../../shared/components/icon/icon';
import { ProfileReviews } from './profile-reviews';
import { ProBadge } from '../../../shared/components/plan-badges/plan-badges';


/**
 * Perfil público real (GET /professionals/:id). Solo muestra lo que el
 * backend expone: sin teléfono, email ni dirección, y sin reseñas,
 * portfolio o métricas de relleno.
 */
@Component({
  selector: 'app-professional-profile-page',
  imports: [RouterLink, Avatar, BackButton, CheckBadge, Icon, ProfileReviews, ProBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './professional-profile-page.html',
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
  readonly id = input.required<string>();

  /** El perfil cargado corresponde a este :id (evita mostrar el anterior un instante). */
  protected readonly pro = computed(() => {
    const p = this.pros.selected();
    return p && p.id === this.id() ? p : null;
  });
  protected readonly avatar = computed(() => {
    const p = this.pro();
    return p ? avatarOf(p) : null;
  });
  protected readonly inComparison = computed(() => this.search.selectedIds().includes(this.id()));
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
  protected readonly licenseForRequest = computed(() => {
    const p = this.pro();
    return !!p && !!this.request.service()?.requiresLicense && hasLicenseFor(p, this.request.service()?.id);
  });
  /** Fotos de portfolio que no cargaron (se ocultan). */
  protected readonly brokenPhotos = signal<ReadonlySet<string>>(new Set());
  protected readonly portfolio = computed(() =>
    (this.pro()?.portfolio ?? []).filter((item) => !this.brokenPhotos().has(item.id)),
  );
  protected readonly f1 = oneDecimal;

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => this.pros.loadDetail(id));
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

  protected photoFailed(item: PortfolioItem): void {
    this.brokenPhotos.update((set) => new Set([...set, item.id]));
  }

  protected retry(): void {
    this.pros.loadDetail(this.id(), true);
  }

  protected back(): void {
    this.backNav.back('/profesionales');
  }

  protected ask(): void {
    const p = this.pro();
    if (!p) return;
    // Si viene del Home o de un link directo, el pedido toma un servicio que el profesional ofrece.
    if (!p.services.some((s) => s.id === this.request.service()?.id) && p.services[0]) {
      const service = this.catalog.activeServices().find((s) => s.id === p.services[0].id);
      if (service) this.request.setService(service);
    }
    this.request.askProfessionals([p]);
    this.router.navigate(['/presupuesto']);
  }

  protected toggleCompare(): void {
    const p = this.pro();
    if (p) this.search.toggleSelected(p);
  }

  protected editRequest(): void {
    this.request.goToStep(4);
    this.router.navigate(['/solicitud']);
  }

  protected async share(): Promise<void> {
    const p = this.pro();
    if (!p || typeof navigator === 'undefined') return;
    const url = location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: `${p.displayName} en Resuelve`, url });
      } else {
        await navigator.clipboard.writeText(url);
        this.toast.show('Copiamos el enlace del perfil');
      }
    } catch {
      /* el usuario canceló */
    }
  }
}
