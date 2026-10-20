import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Icon } from '../icon/icon';
import { RouterLink } from '@angular/router';

/** Invitación con la que llegó esta cuenta (`/pro/acquisition/referrals` → `incoming`). */
export interface IncomingReferral {
  status: 'REGISTERED' | 'ACTIVATED' | 'REWARDED' | 'INVALID';
  rewardDays: number | null;
}

/**
 * Tarjeta del invitado. El premio sale solo al crear el perfil, así que lo
 * normal es REWARDED. REGISTERED = invitación anterior a esa regla: "Activar"
 * corre la misma activación en el backend. Sin pasos ni requisitos que mostrar.
 */
@Component({
  selector: 'app-referral-progress',
  imports: [Icon, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './referral-progress.css',
  template: `
    @if (referral(); as r) {
      @if (r.status !== 'INVALID') {
        <section
          class="referral-progress"
          aria-labelledby="referral-progress-title"
          data-testid="referral-progress"
        >
          <div class="referral-heading">
            <app-icon [name]="r.status === 'REWARDED' ? 'check-circle' : 'users'" [size]="22" />
            <div>
              <p class="eyebrow">Tu invitación a Resuelve</p>
              <h2 id="referral-progress-title">
                @if (r.status === 'REWARDED') {
                  Activaste {{ r.rewardDays }} días de Resuelve PRO
                } @else if (r.status === 'ACTIVATED') {
                  Tu invitación está activa
                } @else {
                  Tenés {{ r.rewardDays }} días de PRO esperándote
                }
              </h2>
              <p class="referral-support">
                @if (r.status === 'REWARDED') {
                  La prueba es única por persona. Invitar colegas no agrega más días.
                } @else if (r.status === 'ACTIVATED') {
                  Prepará tu perfil y activá tu prueba desde Mi plan. No empieza sola ni se acumula con otras invitaciones.
                } @else {
                  Prepará tu perfil y activá tu prueba desde Mi plan. Cada persona la usa una sola vez.
                }
              </p>
            </div>
          </div>
          @if (r.status === 'REGISTERED' || r.status === 'ACTIVATED') {
            <div class="referral-next">
              <a
                routerLink="/pro/plan"
                fragment="prueba-pro"
                class="button-primary"
                data-testid="referral-claim"
              >
                Ver mi prueba en Mi plan
              </a>
            </div>
          }
        </section>
      }
    }
  `,
})
export class ReferralProgress {
  readonly referral = input<IncomingReferral | null>(null);
}
