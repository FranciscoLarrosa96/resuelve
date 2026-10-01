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
    <div class="spotlight-disclosure">
      <span>Perfil destacado</span><span>Espacio promocionado (pago) · PRO</span>
    </div>
    <div class="spotlight-layout">
      <a
        class="spotlight-portrait"
        [routerLink]="['/profesional', pro().id]"
        [queryParams]="search.mode() === 'request' ? { pedido: 1 } : null"
        tabindex="-1"
        aria-hidden="true"
      >
        <app-avatar [subject]="avatar()" alt="" class="size-full rounded-xl text-4xl" />
      </a>
      <div class="spotlight-intro">
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
        <p class="spotlight-availability" [class.text-success-strong]="pro().availableToday">
          <span
            class="size-2 rounded-full"
            [class]="pro().availableToday ? 'bg-success' : 'border border-line-dash'"
            aria-hidden="true"
          ></span>
          {{ pro().availableToday ? 'Disponible hoy' : 'No disponible hoy' }}
        </p>
        @if (pro().bio) {
          <p class="spotlight-bio">{{ pro().bio }}</p>
        }
      </div>
      <div class="spotlight-evidence">
        <p class="spotlight-rating">
          @if (pro().averageRating !== null) {
            <app-icon name="star" [size]="18" class="text-accent" />
            <strong>{{ f1(pro().averageRating!) }}</strong>
            <span
              >{{ pro().reviewsCount }} {{ pro().reviewsCount === 1 ? 'reseña' : 'reseñas' }}</span
            >
          } @else {
            <span>Sin reseñas todavía</span>
          }
        </p>
        @if (pro().yearsExperience > 0) {
          <p>
            {{ pro().yearsExperience }} {{ pro().yearsExperience === 1 ? 'año' : 'años' }} de
            experiencia
          </p>
        }
        @if (zones()) {
          <p class="flex items-start gap-2">
            <app-icon name="pin" [size]="16" class="shrink-0" />{{ zones() }}
          </p>
        }
        @for (signal of trust(); track signal.label) {
          <p class="flex items-start gap-2">
            <app-icon [name]="signal.icon" [size]="16" class="shrink-0 text-brand" />{{
              signal.label
            }}
          </p>
        }
      </div>
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
  protected readonly f1 = oneDecimal;
}
