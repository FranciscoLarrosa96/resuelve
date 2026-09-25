import { Directive, ElementRef, afterNextRender, effect, inject, Injector, signal } from '@angular/core';
import { AbstractControl, FormGroup } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { safeReturnUrl } from '../../core/auth/return-url';
import { AuthStore } from '../../core/state/auth.store';

/** Clases compartidas por los formularios de auth (identidad visual actual). */
export const FIELD_CLASS =
  'mt-1.5 w-full min-w-0 rounded-xl border bg-white px-3.5 py-3 text-base text-ink outline-none transition-colors focus:border-brand';
export const SUBMIT_CLASS =
  'mt-1 flex h-13 w-full items-center justify-center gap-2.5 rounded-xl bg-brand text-[15.5px] font-semibold text-white enabled:hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-70';

/** Render Free puede tardar en despertar: pasado este tiempo se avisa (sin cortar la request). */
const SLOW_MS = 5000;

/** Lógica común de /ingresar y /registro. */
@Directive()
export abstract class AuthForm {
  protected readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  /** Destino interno validado (nunca una URL externa). */
  protected readonly returnUrl = safeReturnUrl(inject(ActivatedRoute).snapshot.queryParamMap.get('returnUrl'));
  protected readonly submitted = signal(false);
  /** La request sigue en curso después de varios segundos (cold start). */
  protected readonly slow = signal(false);
  protected readonly showPassword = signal(false);
  protected abstract readonly form: FormGroup;

  constructor() {
    this.auth.error.set(null);
    let timer: ReturnType<typeof setTimeout> | undefined;
    effect((onCleanup) => {
      if (!this.auth.loading()) {
        this.slow.set(false);
        return;
      }
      timer = setTimeout(() => this.slow.set(true), SLOW_MS);
      onCleanup(() => clearTimeout(timer));
    });
  }

  protected invalid(control: AbstractControl): boolean {
    return control.invalid && (control.touched || this.submitted());
  }

  /** Valida en el cliente; si falla, marca y enfoca el primer campo con error. */
  protected validate(): boolean {
    this.submitted.set(true);
    this.form.markAllAsTouched();
    if (this.form.valid) return true;
    this.focus('[aria-invalid="true"]');
    return false;
  }

  /** Error del backend: marca los campos señalados y enfoca el aviso. */
  protected afterFailure(): void {
    const err = this.auth.error();
    for (const field of err?.fields ?? []) {
      this.form.get(field)?.setErrors({ server: true });
    }
    this.focus(err?.fields.length ? '[aria-invalid="true"]' : '[data-auth-alert]');
  }

  protected goBack(): void {
    this.router.navigateByUrl(this.returnUrl ?? '/perfil', { replaceUrl: true });
  }

  private focus(selector: string): void {
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>(selector)?.focus(), {
      injector: this.injector,
    });
  }
}
