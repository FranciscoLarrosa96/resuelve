import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AUTH_LIMITS } from '../../core/models/auth';
import { ToastService } from '../../core/services/toast.service';
import { Icon } from '../../shared/components/icon/icon';
import { AuthForm, FIELD_CLASS, SUBMIT_CLASS } from './auth-form';

@Component({
  selector: 'app-login-page',
  imports: [ReactiveFormsModule, RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-md animate-fade-in px-5 pt-8 pb-20 lg:pt-16">
      <a routerLink="/" class="text-sm font-semibold text-brand">← Volver al inicio</a>
      <h1 class="mt-5 font-display text-3xl font-bold tracking-[-0.02em]">Ingresar</h1>
      <p class="mt-2 text-muted">
        @if (returnUrl) {
          Ingresá para continuar. No vas a perder lo que venías haciendo.
        } @else {
          Entrá con tu email para ver tus solicitudes y tu perfil.
        }
      </p>

      <form [formGroup]="form" (ngSubmit)="submit()" novalidate
        class="mt-7 flex flex-col gap-4.5 rounded-2xl border border-line bg-white p-5.5">
        @if (auth.error(); as err) {
          <div data-auth-alert tabindex="-1" role="alert"
            class="flex gap-2.5 rounded-xl bg-danger-soft px-3.5 py-3 text-sm font-medium text-danger outline-none">
            <app-icon name="info" [size]="18" [stroke]="2.2" class="mt-px" />{{ err.message }}
          </div>
        }

        <div>
          <label for="login-email" class="text-sm font-semibold">Email</label>
          <input id="login-email" type="email" formControlName="email" autocomplete="email" inputmode="email"
            [class]="fieldClass" [class.border-danger]="invalid(form.controls.email)" [class.border-line-input]="!invalid(form.controls.email)"
            [attr.aria-invalid]="invalid(form.controls.email)"
            [attr.aria-describedby]="invalid(form.controls.email) ? 'login-email-error' : null" />
          @if (invalid(form.controls.email)) {
            <p id="login-email-error" class="mt-1.5 text-[13px] font-medium text-danger">
              {{ form.controls.email.hasError('required') ? 'Ingresá tu email.' : 'Revisá el formato del email.' }}
            </p>
          }
        </div>

        <div>
          <label for="login-password" class="text-sm font-semibold">Contraseña</label>
          <div class="relative">
            <input id="login-password" [type]="showPassword() ? 'text' : 'password'" formControlName="password"
              autocomplete="current-password"
              [class]="fieldClass + ' pr-12'" [class.border-danger]="invalid(form.controls.password)" [class.border-line-input]="!invalid(form.controls.password)"
              [attr.aria-invalid]="invalid(form.controls.password)"
              [attr.aria-describedby]="invalid(form.controls.password) ? 'login-password-error' : null" />
            <button type="button" class="absolute top-1.5 right-1.5 flex size-10 items-center justify-center rounded-lg text-muted hover:text-ink"
              [attr.aria-label]="showPassword() ? 'Ocultar contraseña' : 'Mostrar contraseña'"
              [attr.aria-pressed]="showPassword()" (click)="showPassword.set(!showPassword())">
              <app-icon [name]="showPassword() ? 'eye-off' : 'eye'" [size]="20" />
            </button>
          </div>
          @if (invalid(form.controls.password)) {
            <p id="login-password-error" class="mt-1.5 text-[13px] font-medium text-danger">Ingresá tu contraseña.</p>
          }
        </div>

        <button type="submit" [class]="submitClass" [disabled]="auth.loading()" [attr.aria-busy]="auth.loading()">
          @if (auth.loading()) {
            <span class="size-4.5 animate-spin rounded-full border-[2.5px] border-white/35 border-t-white" aria-hidden="true"></span>
            Ingresando…
          } @else {
            Ingresar
          }
        </button>
        <p class="min-h-5 text-center text-[13px] text-muted" aria-live="polite">
          @if (slow()) { Estamos despertando el servidor, puede tardar unos segundos más. }
        </p>
      </form>

      <p class="mt-5 text-center text-sm text-muted">
        ¿No tenés cuenta?
        <a routerLink="/registro" [queryParams]="returnUrl ? { returnUrl } : {}" class="font-semibold text-brand">Crear cuenta</a>
      </p>
    </div>
  `,
})
export class LoginPage extends AuthForm {
  private readonly toast = inject(ToastService);
  protected readonly fieldClass = FIELD_CLASS;
  protected readonly submitClass = SUBMIT_CLASS;

  protected readonly form = inject(NonNullableFormBuilder).group({
    email: ['', [Validators.required, Validators.email, Validators.maxLength(AUTH_LIMITS.emailMax)]],
    password: ['', [Validators.required, Validators.maxLength(AUTH_LIMITS.passwordMax)]],
  });

  protected async submit(): Promise<void> {
    if (this.auth.loading() || !this.validate()) return;
    const ok = await this.auth.login(this.form.getRawValue());
    if (!ok) return this.afterFailure();
    this.toast.show(`¡Hola, ${this.auth.user()?.firstName}!`);
    this.goBack();
  }
}
