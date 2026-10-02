import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { avatarOf } from '../../../../core/models/avatar';
import { ProfessionalSummary, coverageText } from '../../../../core/models/professional';
import { ProfessionalsStore } from '../../../../core/state/professionals.store';
import { SearchStore } from '../../../../core/state/search.store';
import { oneDecimal } from '../../../../core/utils/format';
import { Avatar } from '../../../../shared/components/avatar/avatar';
import { Icon } from '../../../../shared/components/icon/icon';
import { ProfessionalActions } from './professional-actions';
import { trustSignals } from './professional-presentation';

@Component({
  selector: 'app-featured-professional-spotlight',
  imports: [RouterLink, Avatar, Icon, ProfessionalActions],
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
          <p class="spotlight-service">
            {{ pro().headline || pro().services[0]?.name || 'Profesional en Tandil' }}
          </p>
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
      </div>
      <div class="spotlight-evidence">
        <p [class.text-success-strong]="pro().availableToday" class="font-semibold">
          <span
            class="size-2 rounded-full"
            [class]="pro().availableToday ? 'bg-success' : 'border border-line-dash'"
            aria-hidden="true"
          ></span>
          {{ pro().availableToday ? 'Disponible hoy' : 'No disponible hoy' }}
        </p>
        <p>
          @if (pro().averageRating !== null) {
            <app-icon name="star" [size]="16" [stroke]="2.2" class="text-accent" />
            <strong>{{ f1(pro().averageRating!) }}</strong>
            <span
              >{{ pro().reviewsCount }} {{ pro().reviewsCount === 1 ? 'reseña' : 'reseñas' }}</span
            >
          } @else {
            <span>Sin reseñas todavía</span>
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
      @if (pro().services.length > 1) {
        <ul class="spotlight-services" aria-label="Servicios que ofrece">
          @for (service of pro().services.slice(0, 4); track service.id) {
            <li>{{ service.name }}</li>
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
  protected readonly avatar = computed(() => avatarOf(this.pro()));
  protected readonly zones = computed(() => coverageText(this.pro()));
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
  protected readonly f1 = oneDecimal;
}
