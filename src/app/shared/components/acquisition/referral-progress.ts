import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Icon } from '../icon/icon';

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
  imports: [Icon],
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
                  Quien te invitó también sumó días de PRO.
                } @else if (r.status === 'ACTIVATED') {
                  Los días de PRO por invitación están pausados por ahora. Cuando se habiliten, se
                  suman solos.
                } @else {
                  Ya tenés tu perfil: activalos y quien te invitó también suma días.
                }
              </p>
            </div>
          </div>
          @if (r.status === 'REGISTERED') {
            <div class="referral-next">
              <button
                type="button"
                class="button-primary"
                [disabled]="claiming()"
                [attr.aria-busy]="claiming()"
                (click)="claim.emit()"
                data-testid="referral-claim"
              >
                {{ claiming() ? 'Activando…' : 'Activar mis ' + r.rewardDays + ' días de PRO' }}
              </button>
            </div>
          }
        </section>
      }
    }
  `,
})
export class ReferralProgress {
  readonly referral = input<IncomingReferral | null>(null);
  readonly claiming = input(false);
  readonly claim = output<void>();
}
