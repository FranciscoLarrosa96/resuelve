import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { DemandAlertsApiService } from '../../../core/api/demand-alerts-api.service';
import { AuthStore } from '../../../core/state/auth.store';
import { Icon } from '../icon/icon';

type State = 'idle' | 'saving' | 'active' | 'error';

/**
 * "Avisame cuando haya": en una localidad sin profesionales del servicio buscado, la persona
 * pide un aviso (in-app y por los canales que tenga activos). No es un pedido de presupuesto:
 * no se manda a nadie. Sin sesión, lleva a ingresar y vuelve a esta misma búsqueda.
 */
@Component({
  selector: 'app-demand-alert',
  imports: [Icon, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto mt-5 max-w-md rounded-2xl border border-brand-line bg-brand-tint px-4 py-4 text-left" data-testid="demand-alert">
      @if (state() === 'active') {
        <p class="flex items-start gap-2 text-[15px] text-ink" role="status" data-testid="demand-alert-active">
          <app-icon name="check" [size]="18" class="mt-0.5 shrink-0 text-brand" />
          <span>Listo. Te avisamos cuando haya profesionales de {{ serviceName() }} en {{ cityName() }}.</span>
        </p>
      } @else {
        <p class="text-[15px] font-semibold text-ink">¿Querés que te avisemos?</p>
        <p class="mt-1 text-[14.5px] leading-6 text-ink-soft">
          Te avisamos cuando haya profesionales de {{ serviceName() }} en {{ cityName() }}. No se envía ningún pedido.
        </p>
        @if (auth.authenticated()) {
          <button
            type="button"
            class="button-primary mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-[15px] font-semibold"
            data-testid="demand-alert-button"
            [disabled]="state() === 'saving'"
            (click)="request()"
          >
            <app-icon name="bell" [size]="16" />{{ state() === 'saving' ? 'Guardando…' : 'Avisame cuando haya' }}
          </button>
        } @else {
          <a
            routerLink="/ingresar"
            [queryParams]="{ returnUrl: returnUrl() }"
            class="button-primary mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-[15px] font-semibold"
            data-testid="demand-alert-login"
          >
            <app-icon name="bell" [size]="16" />Ingresá para que te avisemos
          </a>
        }
        @if (state() === 'error') {
          <p class="mt-2 text-sm text-accent-ink" role="alert">No pudimos guardar el aviso. Probá de nuevo.</p>
        }
      }
    </div>
  `,
})
export class DemandAlert {
  protected readonly auth = inject(AuthStore);
  private readonly api = inject(DemandAlertsApiService);
  private readonly router = inject(Router);

  readonly cityId = input.required<string>();
  readonly cityName = input.required<string>();
  readonly serviceId = input.required<string>();
  readonly serviceName = input.required<string>();

  protected readonly state = signal<State>('idle');
  /** Vuelve a esta misma búsqueda (los resultados reflejan la ciudad y el servicio en la URL). */
  protected readonly returnUrl = computed(() => {
    this.cityId();
    this.serviceId();
    return this.router.url;
  });

  constructor() {
    // Con sesión, si ya lo había pedido se ve confirmado (sin volver a pedirlo).
    effect(() => {
      const city = this.cityId();
      const service = this.serviceId();
      const authenticated = this.auth.authenticated();
      untracked(() => {
        this.state.set('idle');
        if (!authenticated) return;
        this.api.status(city, service).subscribe({
          next: (r) => {
            if (r.active && this.cityId() === city && this.serviceId() === service) this.state.set('active');
          },
          error: () => undefined,
        });
      });
    });
  }

  protected request(): void {
    const city = this.cityId();
    const service = this.serviceId();
    this.state.set('saving');
    this.api.request(city, service).subscribe({
      next: () => {
        if (this.cityId() === city && this.serviceId() === service) this.state.set('active');
      },
      error: () => this.state.set('error'),
    });
  }
}
