import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icon } from '../icon/icon';

export interface IncomingReferral {
  status: 'REGISTERED' | 'ACTIVATED' | 'REWARDED' | 'INVALID';
  rewardDays: number | null;
  steps: {
    accountCreated: boolean;
    profileCompleted: boolean;
    serviceConfigured: boolean;
    coverageConfigured: boolean;
    /** null: a license is not a condition for this account's referral activation. */
    licenseValid: boolean | null;
    firstValidQuoteSent: boolean;
  } | null;
}

const STEPS = [
  {
    key: 'accountCreated',
    done: 'Creaste tu cuenta',
    pending: 'Creá tu cuenta',
    cta: null,
    section: null,
  },
  {
    key: 'profileCompleted',
    done: 'Tu perfil está activo y tiene presentación',
    pending: 'Completá la presentación y activá tu perfil',
    cta: 'Completar perfil',
    section: 'presentation',
  },
  {
    key: 'serviceConfigured',
    done: 'Agregaste un servicio activo',
    pending: 'Agregá un servicio activo',
    cta: 'Agregar servicio',
    section: 'services',
  },
  {
    key: 'coverageConfigured',
    done: 'Configuraste tu zona',
    pending: 'Configurá tu zona',
    cta: 'Configurar zona',
    section: 'coverage',
  },
  {
    key: 'licenseValid',
    done: 'Tenés una matrícula válida para ofrecer tu servicio',
    pending: 'Completá la matrícula de tu servicio',
    cta: 'Completar matrícula',
    section: 'license',
  },
  {
    key: 'firstValidQuoteSent',
    done: 'Enviaste un presupuesto a un cliente independiente',
    pending: 'Enviá tu primer presupuesto a un cliente independiente',
    cta: 'Ver oportunidades',
    section: null,
  },
] as const;

/** Presentation only. No profile, license or quote eligibility is recalculated here. */
@Component({
  selector: 'app-referral-progress',
  imports: [RouterLink, Icon],
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
                  ¡Listo! Activaste {{ r.rewardDays }} días de Resuelve PRO
                } @else if (r.status === 'ACTIVATED') {
                  Cumpliste los requisitos
                } @else {
                  Tenés {{ r.rewardDays }} días de PRO esperándote
                }
              </h2>
              <p class="referral-support">
                @if (r.status === 'REWARDED') {
                  Tu invitación también le dio {{ r.rewardDays }} días de PRO a quien te recomendó
                  Resuelve.
                } @else if (r.status === 'ACTIVATED') {
                  Tu beneficio está pendiente de activación.
                } @else {
                  Completá estos pasos para activar tu beneficio.
                }
              </p>
            </div>
          </div>
          @if (r.status === 'REGISTERED' && r.steps) {
            <ul class="referral-checklist" aria-label="Pasos para activar tu beneficio">
              @for (step of steps(); track step.key) {
                <li [class.complete]="step.complete">
                  <app-icon [name]="step.complete ? 'check-circle' : 'clock'" [size]="17" />
                  <span
                    >{{ step.complete ? step.done : step.pending
                    }}<span class="sr-only">
                      · {{ step.complete ? 'Completo' : 'Pendiente' }}</span
                    ></span
                  >
                  <span class="step-state" aria-hidden="true">{{
                    step.complete ? 'Completo' : 'Pendiente'
                  }}</span>
                </li>
              }
            </ul>
            <div class="referral-next">
              <p role="status">
                @if (remaining() === 1) {
                  1 paso para activar tu beneficio
                } @else if (remaining() > 1) {
                  Te faltan {{ remaining() }} pasos para activar tu beneficio
                } @else {
                  Completaste los pasos. Estamos confirmando tu beneficio.
                }
              </p>
              @if (next(); as action) {
                <a
                  [routerLink]="action.link"
                  [queryParams]="action.query"
                  [fragment]="action.fragment"
                  class="button-primary"
                >
                  {{ action.label }} <app-icon name="arrow-right" [size]="16" />
                </a>
              }
            </div>
          }
        </section>
      }
    }
  `,
})
export class ReferralProgress {
  readonly referral = input<IncomingReferral | null>(null);
  protected readonly steps = computed(() => {
    const values = this.referral()?.steps;
    return values
      ? STEPS.filter((step) => values[step.key] !== null).map((step) => ({
          ...step,
          complete: values[step.key] === true,
        }))
      : [];
  });
  protected readonly remaining = computed(
    () => this.steps().filter((step) => !step.complete).length,
  );
  protected readonly next = computed(() => {
    const step = this.steps().find((step) => !step.complete && step.cta);
    if (!step) return null;
    return {
      label: step.cta,
      link: step.key === 'firstValidQuoteSent' ? '/pro/solicitudes' : '/pro/perfil',
      query: step.section && step.section !== 'license' ? { editar: step.section } : null,
      fragment: step.section === 'license' ? 'sec-verifications' : undefined,
    };
  });
}
