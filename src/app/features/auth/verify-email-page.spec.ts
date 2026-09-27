import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { API_URL } from '../../core/api/api.config';
import { AuthUser } from '../../core/models/auth';
import { AuthStore } from '../../core/state/auth.store';
import { RegistrationVerificationStore } from '../../core/state/registration-verification.store';
import { VerifyEmailPage } from './verify-email-page';

const API = 'http://api.test/api/v1';
/** Drena microtasks encadenados (varios `await` seguidos) antes del siguiente paso, más confiable que `whenStable()` para cadenas largas. */
const flush = () => new Promise((r) => setTimeout(r));

const USER: AuthUser = {
  id: 'u-1',
  firstName: 'María',
  lastName: 'González',
  email: 'maria@example.com',
  phone: null,
  phoneVerified: false,
  emailVerifiedAt: null,
  emailVerified: false,
  avatarUrl: null,
  defaultZoneId: null,
  professionalProfileId: null,
  createdAt: '2026-09-01T12:00:00.000Z',
};

@Component({ template: '' })
class Blank {}

function setup(returnUrl?: string) {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([{ path: '**', component: Blank }]),
      { provide: API_URL, useValue: API },
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { queryParamMap: convertToParamMap(returnUrl ? { returnUrl } : {}) } },
      },
    ],
  });
  const auth = TestBed.inject(AuthStore);
  (auth as unknown as { _user: { set(u: AuthUser): void } })['_user'].set(USER);
  (auth as unknown as { _accessToken: { set(t: string): void } })['_accessToken'].set('token');
  return { http: TestBed.inject(HttpTestingController), router: TestBed.inject(Router), auth };
}

describe('VerifyEmailPage', () => {
  it('al montar pide un código y arranca el cooldown', async () => {
    const { http } = setup();
    const fixture = TestBed.createComponent(VerifyEmailPage);
    fixture.detectChanges();
    http.expectOne(`${API}/auth/email-verification/send`).flush(null, { status: 204, statusText: 'No Content' });
    await fixture.whenStable();
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('mar••••@example.com');
    expect(el.textContent).toContain('Reenviar código en 00:');
  });

  it('código correcto: verifica y navega al returnUrl', async () => {
    const { http, router } = setup('/soy-profesional');
    const fixture = TestBed.createComponent(VerifyEmailPage);
    fixture.detectChanges();
    http.expectOne(`${API}/auth/email-verification/send`).flush(null, { status: 204, statusText: 'No Content' });
    await fixture.whenStable();
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    const input = el.querySelector('#verify-code') as HTMLInputElement;
    input.value = '381742';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    http.expectOne(`${API}/auth/email-verification/verify`).flush({ emailVerifiedAt: '2026-02-01T00:00:00.000Z' });
    await fixture.whenStable();
    expect(router.url).toBe('/soy-profesional');
  });

  it('código incorrecto: muestra el error sin navegar', async () => {
    const { http, router } = setup();
    const fixture = TestBed.createComponent(VerifyEmailPage);
    fixture.detectChanges();
    http.expectOne(`${API}/auth/email-verification/send`).flush(null, { status: 204, statusText: 'No Content' });
    await fixture.whenStable();
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    const input = el.querySelector('#verify-code') as HTMLInputElement;
    input.value = '000000';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    http
      .expectOne(`${API}/auth/email-verification/verify`)
      .flush(
        { statusCode: 400, code: 'EMAIL_VERIFICATION_INVALID_CODE', message: 'x' },
        { status: 400, statusText: 'Bad Request' },
      );
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Código incorrecto.');
    expect(router.url).toBe('/');
  });

  it('usar otro email: cambia el email y vuelve al paso del código', async () => {
    const { http } = setup();
    const fixture = TestBed.createComponent(VerifyEmailPage);
    fixture.detectChanges();
    http.expectOne(`${API}/auth/email-verification/send`).flush(null, { status: 204, statusText: 'No Content' });
    await fixture.whenStable();
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    (Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.includes('Usar otro email')) as HTMLButtonElement).click();
    fixture.detectChanges();

    const emailInput = el.querySelector('#new-email') as HTMLInputElement;
    const passwordInput = el.querySelector('#confirm-password') as HTMLInputElement;
    emailInput.value = 'nuevo@example.com';
    emailInput.dispatchEvent(new Event('input'));
    passwordInput.value = 'una-clave-larga';
    passwordInput.dispatchEvent(new Event('input'));
    (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    http.expectOne(`${API}/auth/email`).flush(null, { status: 204, statusText: 'No Content' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.querySelector('#verify-code')).toBeTruthy();
  });
});

/** Registro pendiente: sin sesión, solo `RegistrationVerificationStore`. */
function setupPending(returnUrl?: string) {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([{ path: '**', component: Blank }]),
      { provide: API_URL, useValue: API },
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { queryParamMap: convertToParamMap(returnUrl ? { returnUrl } : {}) } },
      },
    ],
  });
  const pending = TestBed.inject(RegistrationVerificationStore);
  pending.start('sess-1', 'mar••••@example.com');
  return { http: TestBed.inject(HttpTestingController), router: TestBed.inject(Router), auth: TestBed.inject(AuthStore), pending };
}

describe('VerifyEmailPage — registro pendiente (sin sesión)', () => {
  afterEach(() => sessionStorage.clear());

  it('al montar NO pide un código (ya se mandó al registrar); el cooldown corre desde ahí', () => {
    const { http } = setupPending();
    const fixture = TestBed.createComponent(VerifyEmailPage);
    fixture.detectChanges();
    http.verify(); // sin ningún request de "send"
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('mar••••@example.com');
    expect(el.textContent).toContain('Reenviar código en 00:');
  });

  it('código correcto: crea la sesión (completeExternalAuth), muestra éxito y sigue al returnUrl', async () => {
    const { http, router, auth, pending } = setupPending('/soy-profesional');
    const fixture = TestBed.createComponent(VerifyEmailPage);
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    const input = el.querySelector('#verify-code') as HTMLInputElement;
    input.value = '381742';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));

    const verify = http.expectOne(`${API}/auth/register/verify`);
    expect(verify.request.body).toEqual({ verificationSessionId: 'sess-1', code: '381742' });
    verify.flush({ accessToken: 'acc', refreshToken: 'ref', expiresIn: 900, tokenType: 'Bearer' });
    await flush();
    http.expectOne(`${API}/auth/me`).flush({
      id: 'u-2', firstName: 'María', lastName: 'González', email: 'maria@example.com', phone: null,
      phoneVerified: false, emailVerifiedAt: '2026-02-01T00:00:00.000Z', emailVerified: true, avatarUrl: null,
      defaultZoneId: null, professionalProfileId: null, createdAt: '2026-02-01T00:00:00.000Z',
    });
    await flush();
    fixture.detectChanges();

    expect(auth.authenticated()).toBe(true);
    expect(pending.sessionId()).toBeNull(); // se limpió
    expect(el.textContent).toContain('Email verificado');

    (el.querySelector('button') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(router.url).toBe('/soy-profesional');
  });

  it('reenviar llama a /auth/register/resend-code (no al endpoint legacy)', async () => {
    const { http, pending } = setupPending();
    // Fuerza que el cooldown ya haya pasado antes de montar (así el primer render lo ve vencido).
    (pending as unknown as { _codeSentAt: { set(v: number): void } })['_codeSentAt'].set(Date.now() - 61_000);
    const fixture = TestBed.createComponent(VerifyEmailPage);
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    (Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.includes('Reenviar código')) as HTMLButtonElement).click();
    http.expectOne(`${API}/auth/register/resend-code`).flush(null, { status: 204, statusText: 'No Content' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.textContent).toContain('Reenviar código en 00:');
  });

  it('registro vencido al verificar: limpia el pending y muestra "Volver al registro"', async () => {
    const { http, pending } = setupPending();
    const fixture = TestBed.createComponent(VerifyEmailPage);
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    const input = el.querySelector('#verify-code') as HTMLInputElement;
    input.value = '381742';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    http
      .expectOne(`${API}/auth/register/verify`)
      .flush({ statusCode: 410, code: 'PENDING_REGISTRATION_EXPIRED', message: 'x' }, { status: 410, statusText: 'Gone' });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(pending.sessionId()).toBeNull();
    expect(el.textContent).toContain('Tu registro venció');
    expect(el.textContent).toContain('Volver al registro');
  });

  it('usar otro email: sin llamar a la API, limpia el pending y va a /registro', async () => {
    const { http, router, pending } = setupPending();
    const fixture = TestBed.createComponent(VerifyEmailPage);
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    (Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.includes('Usar otro email')) as HTMLButtonElement).click();
    http.verify(); // ningún request: a diferencia del flujo legacy, no hace falta PATCH /auth/email
    await fixture.whenStable();

    expect(pending.sessionId()).toBeNull();
    expect(router.url).toBe('/registro');
  });
});
