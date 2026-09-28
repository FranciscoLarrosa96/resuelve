import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { classifyError } from '../../core/api/api-error';
import { safeReturnUrl } from '../../core/auth/return-url';
import { AuthStore } from '../../core/state/auth.store';
import { RegistrationVerificationStore } from '../../core/state/registration-verification.store';
import { ToastService } from '../../core/services/toast.service';
import { Icon } from '../../shared/components/icon/icon';
import { FIELD_CLASS, SUBMIT_CLASS } from './auth-form';

const DEFAULT_COOLDOWN_SECONDS = 60;
/** Cuánto se ve "Email verificado" antes de seguir a Resuelve (o hasta que toquen "Continuar"). */
const SUCCESS_AUTO_CONTINUE_MS = 1500;

/** `fra••••@gmail.com`: nunca se muestra el email completo si no hace falta. */
function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return email;
  const visible = local.slice(0, Math.min(3, local.length));
  return `${visible}••••@${domain}`;
}

@Component({
  selector: 'app-verify-email-page',
  imports: [ReactiveFormsModule, RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-md animate-fade-in px-5 pt-8 pb-20 lg:pt-16">
      @if (verified()) {
        <div class="mt-10 flex flex-col items-center text-center" role="status">
          <span class="flex size-14 items-center justify-center rounded-full bg-brand-tint text-brand">
            <app-icon name="check" [size]="28" [stroke]="2.4" />
          </span>
          <h1 class="mt-5 font-display text-2xl font-bold tracking-[-0.02em]">Email verificado</h1>
          <p class="mt-2 text-muted">Tu cuenta ya está lista.</p>
          <button type="button" [class]="submitClass + ' mt-6'" (click)="continueAfterVerified()">Continuar a Resuelve</button>
        </div>
      } @else if (pendingExpired()) {
        <h1 class="font-display text-3xl font-bold tracking-[-0.02em]">Tu registro venció</h1>
        <p class="mt-2 text-muted">Volvé a crear tu cuenta.</p>
        <a routerLink="/registro" [class]="submitClass + ' mt-6 inline-flex'">Volver al registro</a>
      } @else if (!changingEmail()) {
        <h1 class="font-display text-3xl font-bold tracking-[-0.02em]">Verificá tu email</h1>
        <p class="mt-2 text-muted">
          Te enviamos un código de 6 dígitos a:
          <span class="font-semibold text-ink">{{ maskedEmail() }}</span>
        </p>

        <form (submit)="$event.preventDefault(); submitCode()" novalidate class="mt-7 flex flex-col gap-4.5 rounded-2xl border border-line bg-surface p-5.5">
          @if (codeError(); as msg) {
            <div tabindex="-1" role="alert" class="flex gap-2.5 rounded-xl bg-danger-soft px-3.5 py-3 text-sm font-medium text-danger outline-none">
              <app-icon name="info" [size]="18" [stroke]="2.2" class="mt-px" />{{ msg }}
            </div>
          }

          <div>
            <label for="verify-code" class="text-sm font-semibold">Código de 6 dígitos</label>
            <input id="verify-code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6"
              [formControl]="code" [class]="fieldClass + ' text-center text-2xl tracking-[0.5em]'"
              [attr.aria-invalid]="!!codeError()" />
          </div>

          <button type="submit" [class]="submitClass" [disabled]="verifying() || code.invalid">
            @if (verifying()) {
              <span class="size-4.5 animate-spin rounded-full border-[2.5px] border-white/35 border-t-white" aria-hidden="true"></span>
              Verificando…
            } @else {
              Verificar
            }
          </button>
        </form>

        <p class="mt-5 text-center text-sm text-muted">
          ¿No llegó?
          @if (cooldown() > 0) {
            Reenviar código en {{ formattedCooldown() }}
          } @else {
            <button type="button" class="font-semibold text-brand disabled:opacity-60" [disabled]="resending()" (click)="resend()">
              Reenviar código
            </button>
          }
        </p>

        <p class="mt-2 text-center text-sm">
          <button type="button" class="font-semibold text-brand" (click)="useAnotherEmail()">Usar otro email</button>
        </p>
      } @else {
        <h1 class="font-display text-3xl font-bold tracking-[-0.02em]">Verificá tu email</h1>
        <p class="mt-2 text-muted">Escribí el email correcto. Vamos a mandarte un código nuevo ahí.</p>

        <form [formGroup]="emailForm" (ngSubmit)="submitEmailChange()" novalidate class="mt-7 flex flex-col gap-4.5 rounded-2xl border border-line bg-surface p-5.5">
          @if (emailChangeError(); as msg) {
            <div tabindex="-1" role="alert" class="flex gap-2.5 rounded-xl bg-danger-soft px-3.5 py-3 text-sm font-medium text-danger outline-none">
              <app-icon name="info" [size]="18" [stroke]="2.2" class="mt-px" />{{ msg }}
            </div>
          }
          <div>
            <label for="new-email" class="text-sm font-semibold">Email nuevo</label>
            <input id="new-email" type="email" formControlName="email" autocomplete="email" [class]="fieldClass" />
          </div>
          <div>
            <label for="confirm-password" class="text-sm font-semibold">Tu contraseña</label>
            <input id="confirm-password" type="password" formControlName="password" autocomplete="current-password" [class]="fieldClass" />
          </div>
          <button type="submit" [class]="submitClass" [disabled]="changingSubmitting() || emailForm.invalid">
            @if (changingSubmitting()) {
              <span class="size-4.5 animate-spin rounded-full border-[2.5px] border-white/35 border-t-white" aria-hidden="true"></span>
              Guardando…
            } @else {
              Guardar email nuevo
            }
          </button>
          <button type="button" class="text-center text-sm font-semibold text-muted" (click)="changingEmail.set(false)">Cancelar</button>
        </form>
      }
    </div>
  `,
})
export class VerifyEmailPage implements OnInit, OnDestroy {
  private readonly auth = inject(AuthStore);
  private readonly pending = inject(RegistrationVerificationStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(ToastService);

  protected readonly fieldClass = FIELD_CLASS;
  protected readonly submitClass = SUBMIT_CLASS;

  /** true = registro pendiente (sin sesión); false = cuenta legacy autenticada sin verificar. */
  protected readonly isPending = computed(() => !!this.pending.sessionId());

  protected readonly code = inject(NonNullableFormBuilder).control('', [
    Validators.required,
    Validators.pattern(/^\d{6}$/),
  ]);
  protected readonly emailForm = inject(NonNullableFormBuilder).group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  protected readonly verifying = signal(false);
  protected readonly resending = signal(false);
  protected readonly changingEmail = signal(false);
  protected readonly changingSubmitting = signal(false);
  protected readonly codeError = signal<string | null>(null);
  protected readonly emailChangeError = signal<string | null>(null);
  protected readonly cooldown = signal(0);
  protected readonly verified = signal(false);
  private timer?: ReturnType<typeof setTimeout>;
  private successTimer?: ReturnType<typeof setTimeout>;

  /** Solo tiene sentido en modo pending: sin sessionId y sin sesión, el registro venció (o nunca existió). */
  protected readonly pendingExpired = signal(false);

  protected readonly maskedEmail = () =>
    this.isPending() ? (this.pending.maskedEmail() ?? '') : maskEmail(this.auth.user()?.email ?? '');
  protected readonly formattedCooldown = () => {
    const s = this.cooldown();
    return `00:${s.toString().padStart(2, '0')}`;
  };

  ngOnInit(): void {
    if (this.isPending()) {
      // El código ya se mandó al registrar (o al último resend): el cooldown se calcula
      // desde ese momento, persistido, así un F5 no reinicia el conteo.
      const sentAt = this.pending.codeSentAt() ?? Date.now();
      const remaining = Math.ceil((sentAt + DEFAULT_COOLDOWN_SECONDS * 1000 - Date.now()) / 1000);
      this.startCooldown(Math.max(0, remaining));
      return;
    }
    // Legacy: puede que ya haya un código vigente; igual pedimos uno, y si el backend
    // responde con el cooldown en curso, solo arrancamos el conteo.
    this.auth.sendEmailVerification().subscribe({
      next: () => this.startCooldown(DEFAULT_COOLDOWN_SECONDS),
      error: (err: unknown) => {
        const e = classifyError(err);
        const retryInSeconds = (err as { error?: { details?: { retryInSeconds?: number } } })?.error?.details
          ?.retryInSeconds;
        if (e.code === 'EMAIL_VERIFICATION_COOLDOWN') this.startCooldown(retryInSeconds ?? DEFAULT_COOLDOWN_SECONDS);
      },
    });
  }

  ngOnDestroy(): void {
    clearTimeout(this.timer);
    clearTimeout(this.successTimer);
  }

  protected submitCode(): void {
    if (this.code.invalid || this.verifying()) return;
    this.verifying.set(true);
    this.codeError.set(null);
    (this.isPending() ? this.verifyPending(this.code.value) : this.verifyLegacy(this.code.value))
      .catch((err: unknown) => {
        const code = classifyError(err).code;
        if (code === 'PENDING_REGISTRATION_EXPIRED') {
          this.pending.clear();
          this.pendingExpired.set(true);
          return;
        }
        this.codeError.set(this.messageFor(code));
      })
      .finally(() => this.verifying.set(false));
  }

  private async verifyPending(code: string): Promise<void> {
    const tokens = await this.pending.verify(code);
    await this.auth.completeExternalAuth(tokens);
    this.pending.clear();
    this.verified.set(true);
    this.successTimer = setTimeout(() => this.continueAfterVerified(), SUCCESS_AUTO_CONTINUE_MS);
  }

  private async verifyLegacy(code: string): Promise<void> {
    await this.auth.verifyEmailCode(code);
    this.toast.show('Email verificado.');
    this.navigateToReturnUrl();
  }

  protected continueAfterVerified(): void {
    clearTimeout(this.successTimer);
    this.navigateToReturnUrl();
  }

  protected resend(): void {
    if (this.resending()) return;
    this.resending.set(true);
    this.codeError.set(null);
    const resent = this.isPending() ? this.pending.resend() : firstValueFrom(this.auth.sendEmailVerification());
    resent
      .then(() => {
        this.startCooldown(DEFAULT_COOLDOWN_SECONDS);
        this.toast.show('Te mandamos un código nuevo.');
      })
      .catch((err: unknown) => {
        const e = classifyError(err);
        if (e.code === 'PENDING_REGISTRATION_EXPIRED') {
          this.pending.clear();
          this.pendingExpired.set(true);
          return;
        }
        if (e.code === 'EMAIL_VERIFICATION_COOLDOWN' || e.kind === 'rate-limited') {
          this.startCooldown(DEFAULT_COOLDOWN_SECONDS);
        }
        this.codeError.set(this.messageFor(e.code));
      })
      .finally(() => this.resending.set(false));
  }

  /** Sin sesión ni `User` en modo pending: alcanza con olvidar el registro y volver al alta. */
  protected useAnotherEmail(): void {
    if (this.isPending()) {
      this.pending.clear();
      this.router.navigate(['/registro']);
      return;
    }
    this.changingEmail.set(true);
  }

  protected submitEmailChange(): void {
    if (this.emailForm.invalid || this.changingSubmitting()) return;
    this.changingSubmitting.set(true);
    this.emailChangeError.set(null);
    const { email, password } = this.emailForm.getRawValue();
    this.auth
      .changeEmailBeforeVerification(email, password)
      .then(() => {
        this.changingEmail.set(false);
        this.emailForm.reset();
        this.startCooldown(DEFAULT_COOLDOWN_SECONDS);
        this.toast.show('Email actualizado. Te mandamos un código nuevo.');
      })
      .catch((err: unknown) => {
        const e = classifyError(err);
        this.emailChangeError.set(
          e.kind === 'unauthorized'
            ? 'Contraseña incorrecta.'
            : e.code === 'EMAIL_ALREADY_REGISTERED'
              ? 'Ya existe una cuenta con ese email.'
              : 'No pudimos cambiar el email. Intentá de nuevo.',
        );
      })
      .finally(() => this.changingSubmitting.set(false));
  }

  private navigateToReturnUrl(): void {
    const destination = safeReturnUrl(this.route.snapshot.queryParamMap.get('returnUrl')) ?? '/perfil';
    this.router.navigateByUrl(destination, { replaceUrl: true });
  }

  private startCooldown(seconds: number): void {
    clearTimeout(this.timer);
    this.cooldown.set(seconds);
    const tick = () => {
      this.cooldown.update((s) => Math.max(0, s - 1));
      if (this.cooldown() > 0) this.timer = setTimeout(tick, 1000);
    };
    if (seconds > 0) this.timer = setTimeout(tick, 1000);
  }

  private messageFor(code: string | null): string {
    switch (code) {
      case 'EMAIL_VERIFICATION_EXPIRED':
        return 'El código venció. Pedí uno nuevo.';
      case 'EMAIL_VERIFICATION_TOO_MANY_ATTEMPTS':
        return 'Demasiados intentos. Pedí un código nuevo.';
      case 'EMAIL_VERIFICATION_RATE_LIMITED':
        return 'Alcanzaste el máximo de códigos por hora. Probá de nuevo más tarde.';
      case 'EMAIL_VERIFICATION_COOLDOWN':
        return 'Ya te mandamos un código. Esperá unos segundos antes de pedir otro.';
      default:
        return 'Código incorrecto.';
    }
  }
}
