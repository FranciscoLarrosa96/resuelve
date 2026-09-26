import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AUTH_LIMITS, RegisterRequest } from '../../core/models/auth';
import { ToastService } from '../../core/services/toast.service';
import { Icon } from '../../shared/components/icon/icon';
import { AuthForm, FIELD_CLASS, SUBMIT_CLASS } from './auth-form';

type Field = 'firstName' | 'lastName' | 'email' | 'phone' | 'password';

@Component({
  selector: 'app-register-page',
  imports: [ReactiveFormsModule, RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-md animate-fade-in px-5 pt-8 pb-20 lg:max-w-lg lg:pt-16">
      <a routerLink="/" class="text-sm font-semibold text-brand">← Volver al inicio</a>
      <h1 class="mt-5 font-display text-3xl font-bold tracking-[-0.02em]">Crear cuenta</h1>
      <p class="mt-2 text-muted">Una sola cuenta para pedir servicios y, si querés, ofrecerlos.</p>

      <form [formGroup]="form" (ngSubmit)="submit()" novalidate
        class="mt-7 flex flex-col gap-4.5 rounded-2xl border border-line bg-white p-5.5">
        @if (auth.error(); as err) {
          <div data-auth-alert tabindex="-1" role="alert"
            class="flex gap-2.5 rounded-xl bg-danger-soft px-3.5 py-3 text-sm font-medium text-danger outline-none">
            <app-icon name="info" [size]="18" [stroke]="2.2" class="mt-px" />
            <span>{{ err.message }}
              @if (err.fields.includes('email')) {
                <a routerLink="/ingresar" [queryParams]="returnUrl ? { returnUrl } : {}" class="underline">Ingresá</a>
              }
            </span>
          </div>
        }

        <div class="grid gap-4.5 sm:grid-cols-2">
          <div>
            <label for="reg-first" class="text-sm font-semibold">Nombre</label>
            <input id="reg-first" formControlName="firstName" autocomplete="given-name" [maxlength]="limits.nameMax"
              [class]="classFor('firstName')" [attr.aria-invalid]="invalid(c.firstName)"
              [attr.aria-describedby]="invalid(c.firstName) ? 'reg-first-error' : null" />
            @if (invalid(c.firstName)) {
              <p id="reg-first-error" class="mt-1.5 text-[13px] font-medium text-danger">{{ message('firstName') }}</p>
            }
          </div>
          <div>
            <label for="reg-last" class="text-sm font-semibold">Apellido</label>
            <input id="reg-last" formControlName="lastName" autocomplete="family-name" [maxlength]="limits.nameMax"
              [class]="classFor('lastName')" [attr.aria-invalid]="invalid(c.lastName)"
              [attr.aria-describedby]="invalid(c.lastName) ? 'reg-last-error' : null" />
            @if (invalid(c.lastName)) {
              <p id="reg-last-error" class="mt-1.5 text-[13px] font-medium text-danger">{{ message('lastName') }}</p>
            }
          </div>
        </div>

        <div>
          <label for="reg-email" class="text-sm font-semibold">Email</label>
          <input id="reg-email" type="email" formControlName="email" autocomplete="email" inputmode="email"
            [class]="classFor('email')" [attr.aria-invalid]="invalid(c.email)"
            [attr.aria-describedby]="invalid(c.email) ? 'reg-email-error' : null" />
          @if (invalid(c.email)) {
            <p id="reg-email-error" class="mt-1.5 text-[13px] font-medium text-danger">{{ message('email') }}</p>
          }
        </div>

        <div>
          <label for="reg-phone" class="text-sm font-semibold">Teléfono <span class="font-normal text-muted">(opcional)</span></label>
          <input id="reg-phone" type="tel" formControlName="phone" autocomplete="tel" inputmode="tel" placeholder="+54 249 400 1234"
            [class]="classFor('phone')" [attr.aria-invalid]="invalid(c.phone)"
            [attr.aria-describedby]="invalid(c.phone) ? 'reg-phone-error' : null" />
          @if (invalid(c.phone)) {
            <p id="reg-phone-error" class="mt-1.5 text-[13px] font-medium text-danger">{{ message('phone') }}</p>
          }
        </div>

        <div>
          <label for="reg-password" class="text-sm font-semibold">Contraseña</label>
          <div class="relative">
            <input id="reg-password" [type]="showPassword() ? 'text' : 'password'" formControlName="password" autocomplete="new-password"
              [class]="classFor('password') + ' pr-12'" [attr.aria-invalid]="invalid(c.password)"
              aria-describedby="reg-password-hint" />
            <button type="button" class="absolute top-1.5 right-1.5 flex size-10 items-center justify-center rounded-lg text-muted hover:text-ink"
              [attr.aria-label]="showPassword() ? 'Ocultar contraseña' : 'Mostrar contraseña'"
              [attr.aria-pressed]="showPassword()" (click)="showPassword.set(!showPassword())">
              <app-icon [name]="showPassword() ? 'eye-off' : 'eye'" [size]="20" />
            </button>
          </div>
          <p id="reg-password-hint" class="mt-1.5 text-[13px]" [class]="invalid(c.password) ? 'font-medium text-danger' : 'text-muted'">
            {{ invalid(c.password) ? message('password') : 'Mínimo ' + limits.passwordMin + ' caracteres.' }}
          </p>
        </div>

        <button type="submit" [class]="submitClass" [disabled]="auth.loading()" [attr.aria-busy]="auth.loading()">
          @if (auth.loading()) {
            <span class="size-4.5 animate-spin rounded-full border-[2.5px] border-white/35 border-t-white" aria-hidden="true"></span>
            Creando cuenta…
          } @else {
            Crear cuenta
          }
        </button>
        <p class="min-h-5 text-center text-[13px] text-muted" aria-live="polite">
          @if (slow()) { Estamos despertando el servidor, puede tardar unos segundos más. }
        </p>
      </form>

      <p class="mt-5 text-center text-sm text-muted">
        ¿Ya tenés cuenta?
        <a routerLink="/ingresar" [queryParams]="returnUrl ? { returnUrl } : {}" class="font-semibold text-brand">Ingresar</a>
      </p>
    </div>
  `,
})
export class RegisterPage extends AuthForm {
  private readonly toast = inject(ToastService);
  protected readonly limits = AUTH_LIMITS;
  protected readonly submitClass = SUBMIT_CLASS;

  protected readonly form = inject(NonNullableFormBuilder).group({
    firstName: ['', [Validators.required, Validators.maxLength(AUTH_LIMITS.nameMax), notBlank]],
    lastName: ['', [Validators.required, Validators.maxLength(AUTH_LIMITS.nameMax), notBlank]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(AUTH_LIMITS.emailMax)]],
    phone: ['', [Validators.pattern(AUTH_LIMITS.phonePattern)]],
    password: [
      '',
      [Validators.required, Validators.minLength(AUTH_LIMITS.passwordMin), Validators.maxLength(AUTH_LIMITS.passwordMax)],
    ],
  });
  protected readonly c = this.form.controls;

  protected classFor(field: Field): string {
    return `${FIELD_CLASS} ${this.invalid(this.c[field]) ? 'border-danger' : 'border-line-input'}`;
  }

  protected message(field: Field): string {
    const control = this.c[field];
    if (control.hasError('server')) {
      return field === 'email' && this.auth.error()?.fields.includes('email')
        ? 'Este email ya tiene una cuenta.'
        : 'Revisá este dato.';
    }
    if (control.hasError('required') || control.hasError('blank')) {
      return { firstName: 'Ingresá tu nombre.', lastName: 'Ingresá tu apellido.', email: 'Ingresá tu email.', phone: '', password: 'Elegí una contraseña.' }[field];
    }
    if (control.hasError('email')) return 'Revisá el formato del email.';
    if (control.hasError('pattern')) return 'Usá solo números, espacios, guiones o paréntesis (ej.: +54 249 400 1234).';
    if (control.hasError('minlength')) return `La contraseña necesita al menos ${AUTH_LIMITS.passwordMin} caracteres.`;
    if (control.hasError('maxlength')) return 'Es demasiado largo.';
    return 'Revisá este dato.';
  }

  protected async submit(): Promise<void> {
    if (this.auth.loading() || !this.validate()) return;
    const { phone, ...rest } = this.form.getRawValue();
    const body: RegisterRequest = {
      ...rest,
      firstName: rest.firstName.trim(),
      lastName: rest.lastName.trim(),
      email: rest.email.trim(),
      ...(phone.trim() ? { phone: phone.trim() } : {}),
    };
    const ok = await this.auth.register(body);
    if (!ok) return this.afterFailure();
    this.toast.show(`¡Listo, ${this.auth.user()?.firstName}! Tu cuenta está creada.`);
    this.goBack();
  }
}

function notBlank(control: AbstractControl) {
  return typeof control.value === 'string' && control.value.length > 0 && !control.value.trim() ? { blank: true } : null;
}
