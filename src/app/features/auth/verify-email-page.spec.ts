import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { API_URL } from '../../core/api/api.config';
import { AuthUser } from '../../core/models/auth';
import { AuthStore } from '../../core/state/auth.store';
import { VerifyEmailPage } from './verify-email-page';

const API = 'http://api.test/api/v1';

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
