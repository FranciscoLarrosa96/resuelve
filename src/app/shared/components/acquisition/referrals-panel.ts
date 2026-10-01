import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  PLATFORM_ID,
  inject,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { API_URL } from '../../../core/api/api.config';
import { PublicLinks } from '../../../core/acquisition/public-links';
import { IncomingReferral, ReferralProgress } from './referral-progress';

interface ReferralSummary {
  incoming?: IncomingReferral | null;
  enabled: boolean;
  code: string | null;
  rewardDays: number;
  rewardsEnabled: boolean;
  counts: { registered: number; activated: number; rewarded: number };
  items: {
    id: string;
    firstName: string;
    lastInitial: string;
    status: 'REGISTERED' | 'ACTIVATED' | 'REWARDED' | 'INVALID';
    rewardDays: number | null;
  }[];
}
@Component({
  selector: 'app-referrals-panel',
  imports: [ReferralProgress],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (data(); as d) {
      <app-referral-progress [referral]="d.incoming ?? null" />
      @if (error()) {
        <p role="alert" class="mt-2 text-sm text-muted">
          No pudimos actualizar el progreso. Intentá de nuevo.
        </p>
      }
      @if (
        d.incoming && (d.incoming.status === 'REGISTERED' || d.incoming.status === 'ACTIVATED')
      ) {
        <button
          type="button"
          class="min-h-11 text-sm font-semibold text-brand"
          (click)="load()"
          [disabled]="loading()"
          [attr.aria-busy]="loading()"
        >
          {{ loading() ? 'Actualizando beneficio…' : 'Actualizar progreso' }}
        </button>
      }
      @if (d.enabled && d.code) {
        <section class="mt-8 border-y border-line py-6" aria-labelledby="referrals-title">
          <h2 id="referrals-title" class="font-sans text-2xl font-bold">
            Invitá a otro profesional
          </h2>
          <p class="mt-2 max-w-xl text-sm leading-6 text-muted">
            {{
              d.rewardsEnabled
                ? 'Cuando complete su perfil y envíe su primer presupuesto a un cliente independiente, ambos reciben ' +
                  d.rewardDays +
                  ' días de PRO.'
                : 'Invitá a un colega a trabajar con Resuelve. Las recompensas todavía no están habilitadas.'
            }}
          </p>
          <label for="referral-link" class="mt-4 block text-xs font-semibold"
            >Tu enlace de invitación</label
          >
          <input
            id="referral-link"
            class="field-control mt-2 h-11 w-full max-w-xl min-w-0 rounded-xl px-3 text-sm"
            readonly
            [value]="links.referral(d.code)"
            (focus)="$any($event.target).select()"
          />
          <div class="mt-3 flex flex-wrap gap-2">
            <a
              [href]="whatsapp(d.code)"
              target="_blank"
              rel="noopener noreferrer"
              class="button-primary flex min-h-11 items-center rounded-xl px-4 text-sm font-semibold"
              >WhatsApp</a
            >
            <button
              type="button"
              class="button-secondary min-h-11 rounded-xl px-4 text-sm font-semibold"
              (click)="copy(d.code)"
            >
              Copiar enlace
            </button>
          </div>
          <p role="status" class="mt-2 text-xs text-muted">{{ notice() }}</p>
          <h3 class="mt-6 text-sm font-semibold">Invitaciones</h3>
          <p class="mt-1 text-sm text-muted">
            {{ d.counts.registered }} se registraron · {{ d.counts.activated }} se activaron ·
            {{ d.counts.rewarded }} recompensas obtenidas
          </p>
          @if (d.counts.registered > d.items.length) {
            <p class="mt-2 text-xs text-muted">
              Mostramos las {{ d.items.length }} invitaciones más recientes.
            </p>
          }
          <ul class="mt-3 divide-y divide-line">
            @for (r of d.items; track r.id) {
              <li class="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                <span class="font-semibold">{{ r.firstName }} {{ r.lastInitial }}.</span>
                <span class="text-muted"
                  >{{ labels[r.status] }} ·
                  {{
                    r.rewardDays
                      ? '+' + r.rewardDays + ' días PRO'
                      : r.status === 'REGISTERED'
                        ? 'Todavía no se activó'
                        : 'Sin recompensa aplicada'
                  }}</span
                >
              </li>
            } @empty {
              <li class="py-3 text-sm text-muted">
                Todavía no se registraron colegas con tu enlace.
              </li>
            }
          </ul>
        </section>
      }
    } @else if (error()) {
      <div class="mt-6 border-t border-line pt-4">
        <p role="alert" class="text-sm text-muted">No pudimos cargar tus invitaciones.</p>
        <button type="button" class="min-h-11 text-sm font-semibold text-brand" (click)="load()">
          Reintentar
        </button>
      </div>
    }
  `,
})
export class ReferralsPanel {
  private readonly http = inject(HttpClient);
  private readonly api = inject(API_URL);
  private readonly destroy = inject(DestroyRef);
  protected readonly links = inject(PublicLinks);
  protected readonly data = signal<ReferralSummary | null>(null);
  protected readonly error = signal(false);
  protected readonly loading = signal(false);
  protected readonly notice = signal('');
  protected readonly labels = {
    REGISTERED: 'Registrado',
    ACTIVATED: 'Activado',
    REWARDED: 'Recompensado',
    INVALID: 'No válido',
  };
  constructor() {
    if (isPlatformBrowser(inject(PLATFORM_ID))) this.load();
  }
  protected load(): void {
    if (this.loading()) return;
    this.loading.set(true);
    this.error.set(false);
    const sub = this.http.get<ReferralSummary>(`${this.api}/pro/acquisition/referrals`).subscribe({
      next: (d) => {
        this.data.set(d);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(true);
        this.loading.set(false);
      },
    });
    this.destroy.onDestroy(() => sub.unsubscribe());
  }
  protected whatsapp(code: string): string {
    return (
      'https://wa.me/?text=' +
      encodeURIComponent(
        `Te invito a trabajar con Resuelve. Creá tu perfil profesional:\n${this.links.referral(code)}`,
      )
    );
  }
  protected async copy(code: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.links.referral(code));
      this.notice.set('Enlace copiado.');
    } catch {
      this.notice.set('Seleccioná el enlace para copiarlo con el menú de tu dispositivo.');
    }
  }
}
