import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { avatarOf } from '../../../../core/models/avatar';
import { ProfessionalSummary, coverageText } from '../../../../core/models/professional';
import { LocalityStore } from '../../../../core/state/locality.store';
import { ProfessionalsStore } from '../../../../core/state/professionals.store';
import { SearchStore } from '../../../../core/state/search.store';
import { headlineRepeatsChips, serviceChipsView } from '../../../../core/utils/service-chips';
import { oneDecimal } from '../../../../core/utils/format';
import { Avatar } from '../../../../shared/components/avatar/avatar';
import { Icon } from '../../../../shared/components/icon/icon';
import { ProfessionalActions } from './professional-actions';
import { ProfessionalServiceChips } from '../../../../shared/components/professional-service-chips/professional-service-chips';
import { WorkCovers } from '../../../../shared/components/work-covers/work-covers';
import { trustSignals } from './professional-presentation';
import { noReviewsText } from '../../../../core/utils/reputation';
import { responseText } from '../../../../core/utils/professional-facts';

@Component({
  selector: 'app-featured-professional-spotlight',
  imports: [RouterLink, Avatar, Icon, ProfessionalActions, WorkCovers, ProfessionalServiceChips],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './featured-professional-spotlight.css',
  template: `
    <p class="spotlight-disclosure">Destacado PRO · Espacio promocionado (pago)</p>
    <div class="spotlight-layout" [class.no-photo]="!avatar().photoUrl">
      <a
        class="spotlight-portrait"
        [routerLink]="['/profesional', pro().id]"
        [queryParams]="search.mode() === 'request' ? { pedido: 1 } : null"
        tabindex="-1"
        aria-hidden="true"
      >
        <app-avatar [subject]="avatar()" alt="" class="size-full text-4xl" />
      </a>
      <div class="spotlight-main min-w-0">
        <div class="spotlight-head min-w-0">
          @if (headline()) {
            <p class="spotlight-service">{{ headline() }}</p>
          }
          <h3>
            <a
              [routerLink]="['/profesional', pro().id]"
              [queryParams]="search.mode() === 'request' ? { pedido: 1 } : null"
              >{{ pro().displayName }}</a
            >
          </h3>
        </div>
        @if (pro().bio) {
          <p class="spotlight-bio">{{ pro().bio }}</p>
        }
        @if (pro().workCovers?.length) {
          <app-work-covers class="mt-4 block max-w-2xl" [covers]="pro().workCovers!" />
        }
      </div>
      <app-professional-service-chips
        class="spotlight-services"
        [services]="pro().services"
        [matchServiceId]="matchServiceId()"
      />
      <div class="spotlight-evidence">
        @if (pro().availableToday) {
          <p class="font-semibold text-success-strong">
            <span class="size-2 rounded-full bg-success" aria-hidden="true"></span>
            Atiende urgencias
          </p>
        }
        <p>
          @if (pro().averageRating !== null) {
            <app-icon name="star" [size]="16" [stroke]="2.2" class="text-accent" />
            <strong>{{ f1(pro().averageRating!) }}</strong>
            <span
              >{{ pro().reviewsCount }} {{ pro().reviewsCount === 1 ? 'reseña' : 'reseñas' }}</span
            >
          } @else {
            <span>{{ noReviews(pro()) }}</span>
          }
        </p>
        @if (pro().completedJobsCount > 0) {
          <p>
            <strong>{{ pro().completedJobsCount }}</strong>
            {{ pro().completedJobsCount === 1 ? 'trabajo' : 'trabajos' }} por Resuelve
          </p>
        }
        @if (pro().yearsExperience > 0) {
          <p>
            <strong>{{ pro().yearsExperience }}</strong>
            {{ pro().yearsExperience === 1 ? 'año' : 'años' }} de experiencia
          </p>
        }
        @if (response(); as r) {
          <p><app-icon name="clock" [size]="15" class="shrink-0" />{{ r }}</p>
        }
        @if (zones()) {
          <p><app-icon name="pin" [size]="15" class="shrink-0" />{{ zones() }}</p>
        }
      </div>
      @if (verifications().length) {
        <ul class="spotlight-trust" aria-label="Verificaciones">
          @for (signal of verifications(); track signal.label) {
            <li class="flex items-center gap-1.5">
              <app-icon [name]="signal.icon" [size]="15" class="shrink-0 text-brand" />{{
                signal.label
              }}
            </li>
          }
        </ul>
      }
      <app-professional-actions
        class="spotlight-actions"
        [pro]="pro()"
        [comparison]="comparison()"
        (ask)="ask.emit($event)"
      />
    </div>
  `,
})
export class FeaturedProfessionalSpotlight {
  protected readonly search = inject(SearchStore);
  private readonly professionals = inject(ProfessionalsStore);
  readonly pro = input.required<ProfessionalSummary>();
  readonly comparison = input(true);
  readonly ask = output<ProfessionalSummary>();
  protected readonly matchServiceId = computed(() => this.professionals.filters().serviceId);
  /** Título declarado; no repite el chip del servicio (los servicios van en los chips). */
  protected readonly headline = computed(() =>
    headlineRepeatsChips(this.pro().headline, serviceChipsView(this.pro().services, this.matchServiceId()))
      ? ''
      : this.pro().headline,
  );
  protected readonly avatar = computed(() => avatarOf(this.pro()));
  private readonly locality = inject(LocalityStore);
  protected readonly zones = computed(() => coverageText(this.pro(), this.locality.id(), this.locality.name()));
  protected readonly trust = computed(() =>
    trustSignals(
      this.pro(),
      this.search.licenseApplicable(),
      this.professionals.filters().serviceId,
    ),
  );
  /** Los trabajos por Resuelve ya viajan en la línea de evidencia. */
  protected readonly verifications = computed(() =>
    this.trust().filter((signal) => signal.icon !== 'briefcase'),
  );
  protected readonly response = computed(() => responseText(this.pro().averageResponseMinutes));
  protected readonly f1 = oneDecimal;
  protected readonly noReviews = noReviewsText;
}
