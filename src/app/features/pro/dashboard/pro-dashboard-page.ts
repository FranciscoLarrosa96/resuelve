import { ChangeDetectionStrategy, Component, computed, effect, inject, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NotificationsStore } from '../../../core/state/notifications.store';
import { ProRequestsStore } from '../../../core/state/pro-requests.store';
import { ProStore } from '../../../core/state/pro.store';
import { oneDecimal } from '../../../core/utils/format';
import { NO_REVIEWS_TEXT, hasReviews, reviewsLabel } from '../../../core/utils/reputation';
import { AvailabilitySwitch } from '../../../shared/components/availability-switch/availability-switch';
import { longToday, requestMeta } from '../pro-ui';

/**
 * Inicio del panel profesional. Solo datos REALES: la ruta exige sesión y
 * perfil profesional (professionalGuard), así que nunca hay una versión
 * demo de respaldo. Sin datos → cargando, vacío o error con reintento.
 */
@Component({
  selector: 'app-pro-dashboard-page',
  imports: [RouterLink, AvailabilitySwitch],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pro-dashboard-page.html',
})
export class ProDashboardPage {
  protected readonly store = inject(ProStore);
  protected readonly reqs = inject(ProRequestsStore);
  /** Trabajos con horario terminado sin cerrar (se deriva por fecha en el backend). */
  protected readonly notifications = inject(NotificationsStore);

  protected readonly today = longToday();
  protected readonly greeting = computed(() => (this.store.firstName() ? `Buen día, ${this.store.firstName()}` : 'Buen día'));
  /** Valoración REAL (GET /pro/me): sin reseñas no hay número. */
  protected readonly rating = computed(() => {
    const p = this.store.ownProfile();
    return p && hasReviews(p) ? { average: oneDecimal(p.averageRating!), count: reviewsLabel(p.reviewsCount) } : null;
  });
  protected readonly noReviews = NO_REVIEWS_TEXT;
  protected readonly meta = requestMeta;

  protected readonly dashRequests = computed(() =>
    this.reqs.tab() === 'PENDING' ? this.reqs.items().slice(0, 4) : [],
  );

  constructor() {
    effect(() => {
      if (!this.reqs.hasProfile()) return;
      untracked(() => {
        if (this.reqs.tab() === 'PENDING') this.reqs.load(true);
        else this.reqs.setTab('PENDING');
      });
    });
  }
}
