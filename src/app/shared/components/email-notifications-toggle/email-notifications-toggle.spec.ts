import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { API_URL } from '../../../core/api/api.config';
import { ToastService } from '../../../core/services/toast.service';
import { AuthStore } from '../../../core/state/auth.store';
import { EMAIL_NOTIFICATIONS_MESSAGES, EmailNotificationsToggle } from './email-notifications-toggle';

const API = 'http://api.test/api/v1';
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

function setup(emailNotifications: boolean | undefined, deliveryEnabled: boolean | null = true) {
  const user = signal<{ emailNotifications?: boolean }>({ emailNotifications });
  const auth = {
    user,
    setEmailNotifications: vi.fn((v: boolean) => user.set({ emailNotifications: v })),
  };
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: API_URL, useValue: API },
      { provide: AuthStore, useValue: auth },
    ],
  });
  const http = TestBed.inject(HttpTestingController);
  const toast = TestBed.inject(ToastService);
  const fixture = TestBed.createComponent(EmailNotificationsToggle);
  fixture.detectChanges();
  if (deliveryEnabled !== null) {
    http.expectOne(`${API}/me/notifications/email-config`).flush({ deliveryEnabled });
    fixture.detectChanges();
  }
  const sw = () => fixture.nativeElement.querySelector('[role="switch"]') as HTMLButtonElement;
  return { auth, http, toast, fixture, sw };
}

describe('EmailNotificationsToggle', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('arranca prendido (también si la cuenta no trae el dato) y se apaga guardando en el backend', async () => {
    const { auth, http, toast, fixture, sw } = setup(undefined);
    expect(sw().getAttribute('aria-checked')).toBe('true');
    sw().click();
    fixture.detectChanges();
    expect(sw().disabled).toBe(true);
    const req = http.expectOne({ method: 'PATCH', url: `${API}/me/notifications/email-preference` });
    expect(req.request.body).toEqual({ enabled: false });
    req.flush({ enabled: false, deliveryEnabled: true });
    await flush();
    fixture.detectChanges();
    expect(auth.setEmailNotifications).toHaveBeenCalledWith(false);
    expect(sw().getAttribute('aria-checked')).toBe('false');
    expect(toast.message()).toBe(EMAIL_NOTIFICATIONS_MESSAGES.off);
  });

  it('si no se pudo guardar, queda como estaba y avisa', async () => {
    const { auth, http, toast, fixture, sw } = setup(true);
    sw().click();
    http.expectOne({ method: 'PATCH', url: `${API}/me/notifications/email-preference` }).flush(null, {
      status: 500,
      statusText: 'Server Error',
    });
    await flush();
    fixture.detectChanges();
    expect(auth.setEmailNotifications).not.toHaveBeenCalled();
    expect(sw().getAttribute('aria-checked')).toBe('true');
    expect(toast.message()).toBe(EMAIL_NOTIFICATIONS_MESSAGES.failed);
  });

  it('apagado se vuelve a prender', async () => {
    const { http, toast, fixture, sw } = setup(false);
    expect(sw().getAttribute('aria-checked')).toBe('false');
    sw().click();
    http.expectOne({ method: 'PATCH', url: `${API}/me/notifications/email-preference` }).flush({ enabled: true, deliveryEnabled: true });
    await flush();
    fixture.detectChanges();
    expect(sw().getAttribute('aria-checked')).toBe('true');
    expect(toast.message()).toBe(EMAIL_NOTIFICATIONS_MESSAGES.on);
  });

  it('envío apagado: conserva la preferencia y avisa sin prometer correos', async () => {
    const { auth, http, fixture, sw, toast } = setup(false, false);
    expect(fixture.nativeElement.textContent).toContain('El envío de avisos por email está desactivado');
    expect(sw().getAttribute('aria-checked')).toBe('false');
    sw().click();
    http.expectOne(`${API}/me/notifications/email-preference`).flush({ enabled: true, deliveryEnabled: false });
    await flush();
    fixture.detectChanges();
    expect(auth.setEmailNotifications).toHaveBeenCalledWith(true);
    expect(sw().getAttribute('aria-checked')).toBe('true');
    expect(toast.message()).toBe(EMAIL_NOTIFICATIONS_MESSAGES.paused);
  });

  it('si cambia la configuración entre abrir y guardar, usa la respuesta fresca', async () => {
    const { http, fixture, sw, toast } = setup(false);
    sw().click();
    http.expectOne(`${API}/me/notifications/email-preference`).flush({ enabled: true, deliveryEnabled: false });
    await flush();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="email-delivery-paused"]')).not.toBeNull();
    expect(toast.message()).toBe(EMAIL_NOTIFICATIONS_MESSAGES.paused);
  });

  it('cargando no permite cambiar; si falla informa estado desconocido y permite reintentar', () => {
    const { http, fixture, sw } = setup(true, null);
    expect(sw().disabled).toBe(true);
    http.expectOne(`${API}/me/notifications/email-config`).flush({}, { status: 503, statusText: 'Unavailable' });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No pudimos comprobar');
    expect(fixture.nativeElement.querySelector('[data-testid="email-delivery-paused"]')).toBeNull();
    fixture.nativeElement.querySelector('p button').click();
    http.expectOne(`${API}/me/notifications/email-config`).flush({ deliveryEnabled: false });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="email-delivery-paused"]')).not.toBeNull();
    expect(sw().getAttribute('aria-checked')).toBe('true');
  });
});
