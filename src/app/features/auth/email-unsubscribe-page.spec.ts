import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { API_URL } from '../../core/api/api.config';
import { EmailUnsubscribePage, UNSUBSCRIBE_MESSAGES } from './email-unsubscribe-page';

const API = 'http://api.test/api/v1';
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

function setup(token: string | null) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: API_URL, useValue: API },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: () => token } } } },
    ],
  });
  const http = TestBed.inject(HttpTestingController);
  const fixture = TestBed.createComponent(EmailUnsubscribePage);
  fixture.detectChanges();
  const host = fixture.nativeElement as HTMLElement;
  const text = () => host.textContent!.replace(/\s+/g, ' ');
  const confirm = () => [...host.querySelectorAll('button')].find((b) => b.textContent!.includes('Dejar de recibir')) as HTMLButtonElement | undefined;
  return { http, fixture, text, confirm };
}

describe('EmailUnsubscribePage', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('abrir el enlace NO da de baja: hace falta tocar el botón', () => {
    const { text, confirm } = setup('tok');
    expect(confirm()).toBeTruthy();
    expect(text()).toContain('¿Querés dejar de recibir');
  });

  it('al confirmar manda el token (sin sesión) y avisa que quedó la baja', async () => {
    const { http, fixture, text, confirm } = setup('abc.def');
    confirm()!.click();
    fixture.detectChanges();
    const req = http.expectOne({ method: 'POST', url: `${API}/notifications/email-unsubscribe` });
    expect(req.request.body).toEqual({ token: 'abc.def' });
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush(null, { status: 204, statusText: 'No Content' });
    await flush();
    fixture.detectChanges();
    expect(text()).toContain('no te escribimos más');
  });

  it('sin token no ofrece la baja y manda a Mi perfil', () => {
    const { text, confirm } = setup(null);
    expect(confirm()).toBeUndefined();
    expect(text()).toContain(UNSUBSCRIBE_MESSAGES.invalid);
    expect(text()).toContain('Ir a Mi perfil');
  });

  it('con un token inválido lo dice y no da por hecha la baja', async () => {
    const { http, fixture, text, confirm } = setup('malo');
    confirm()!.click();
    http.expectOne({ method: 'POST', url: `${API}/notifications/email-unsubscribe` }).flush(
      { code: 'INVALID_UNSUBSCRIBE_TOKEN', message: 'x' },
      { status: 400, statusText: 'Bad Request' },
    );
    await flush();
    fixture.detectChanges();
    expect(text()).toContain(UNSUBSCRIBE_MESSAGES.invalid);
    expect(text()).not.toContain('no te escribimos más');
  });
});
