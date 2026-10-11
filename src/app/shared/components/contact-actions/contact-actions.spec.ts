import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { ExposureTracker } from '../../../core/analytics/exposure-tracker';
import { API_URL } from '../../../core/api/api.config';
import { ContactChannels } from '../../../core/models/professional';
import { DirectContact } from '../../../core/state/direct-contact';
import { ContactActions } from './contact-actions';

const API = 'http://api.test/api/v1';
const SESSION = 'sesion-anonima-0123456789';
const flush = () => new Promise<void>((r) => setTimeout(r, 0));
const WA = {
  channel: 'WHATSAPP',
  href: 'https://wa.me/5492494123456?text=%C2%A1Hola!',
  number: '+5492494123456',
  display: '+54 9 249 412-3456',
};
const TEL = { channel: 'PHONE', href: 'tel:+542494423456', number: '+542494423456', display: '+54 249 442-3456' };

function setup(channels: ContactChannels | undefined, opts: { dial?: boolean; primary?: boolean } = {}) {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: API_URL, useValue: API },
      { provide: ExposureTracker, useValue: { attributionSessionKey: () => SESSION } },
    ],
  });
  vi.spyOn(TestBed.inject(DirectContact), 'canDial').mockReturnValue(opts.dial ?? false);
  const fixture = TestBed.createComponent(ContactActions);
  fixture.componentRef.setInput('professional', {
    id: 'pro-1',
    displayName: 'Juan Pérez',
    contactChannels: channels,
    acceptingRequests: true,
  });
  fixture.componentRef.setInput('primary', opts.primary ?? false);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return { fixture, el, http: TestBed.inject(HttpTestingController) };
}

describe('ContactActions', () => {
  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    vi.restoreAllMocks();
  });

  it('muestra solo los canales habilitados, nunca botones deshabilitados', () => {
    let { el } = setup({ whatsapp: true, phone: false, requests: true });
    expect(el.querySelector('[data-testid="contact-whatsapp"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="contact-phone"]')).toBeNull();
    expect(el.querySelectorAll('button[disabled]').length).toBe(0);

    TestBed.resetTestingModule();
    ({ el } = setup({ whatsapp: false, phone: false, requests: true }));
    expect(el.querySelector('[data-testid="contact-actions"]')).toBeNull();

    TestBed.resetTestingModule();
    // Backend anterior sin `contactChannels`: no hay contacto directo.
    ({ el } = setup(undefined));
    expect(el.querySelector('[data-testid="contact-actions"]')).toBeNull();
  });

  it('WhatsApp: abre la pestaña en el mismo toque y le da el enlace oficial (sin cuenta, sin crear una solicitud)', async () => {
    const win = { opener: {} as unknown, location: { href: '' }, close: vi.fn() };
    const open = vi.spyOn(window, 'open').mockReturnValue(win as unknown as Window);
    const { el, http, fixture } = setup({ whatsapp: true, phone: true, requests: true });
    el.querySelector<HTMLButtonElement>('[data-testid="contact-whatsapp"]')!.click();
    expect(open).toHaveBeenCalledWith('', '_blank');
    const req = http.expectOne({ method: 'POST', url: `${API}/professionals/pro-1/contact` });
    expect(req.request.body).toEqual({ channel: 'WHATSAPP', sessionKey: SESSION });
    req.flush(WA);
    await flush();
    fixture.detectChanges();
    expect(win.location.href).toBe(WA.href);
    expect(win.opener).toBeNull();
    // Ningún otro pedido: no se crea una solicitud ni se toca nada más.
    http.expectNone(`${API}/requests`);

    // El segundo toque abre directo, sin volver a pedir el número.
    el.querySelector<HTMLButtonElement>('[data-testid="contact-whatsapp"]')!.click();
    expect(open).toHaveBeenLastCalledWith(WA.href, '_blank', 'noopener,noreferrer');
  });

  it('Llamar en el celular marca el número con tel:', async () => {
    const { el, http } = setup({ whatsapp: false, phone: true, requests: false }, { dial: true, primary: true });
    await flush();
    const button = el.querySelector<HTMLButtonElement>('[data-testid="contact-phone"]')!;
    expect(button.textContent).toContain('Llamar');
    expect(button.className).toContain('button-primary');
    const assign = vi.fn();
    const original = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        set href(v: string) {
          assign(v);
        },
      },
    });
    try {
      button.click();
      http.expectOne(`${API}/professionals/pro-1/contact`).flush(TEL);
      await flush();
      expect(assign).toHaveBeenCalledWith('tel:+542494423456');
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: original });
    }
  });

  it('en la computadora muestra el número para copiarlo o llamarlo', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const { el, http, fixture } = setup({ whatsapp: false, phone: true, requests: true });
    await flush();
    fixture.detectChanges();
    const button = el.querySelector<HTMLButtonElement>('[data-testid="contact-phone"]')!;
    expect(button.textContent).toContain('Ver teléfono');
    button.click();
    http.expectOne(`${API}/professionals/pro-1/contact`).flush(TEL);
    await flush();
    fixture.detectChanges();
    const shown = el.querySelector('[data-testid="contact-phone-number"]')!;
    expect(shown.textContent).toContain('+54 249 442-3456');
    expect(shown.querySelector('a')!.getAttribute('href')).toBe('tel:+542494423456');
    shown.querySelector('button')!.click();
    await flush();
    expect(writeText).toHaveBeenCalledWith('+542494423456');
  });

  it('si el canal ya no está disponible, avisa y cierra la pestaña vacía', async () => {
    const win = { opener: {}, location: { href: '' }, close: vi.fn() };
    vi.spyOn(window, 'open').mockReturnValue(win as unknown as Window);
    const { el, http, fixture } = setup({ whatsapp: true, phone: false, requests: true });
    el.querySelector<HTMLButtonElement>('[data-testid="contact-whatsapp"]')!.click();
    http
      .expectOne(`${API}/professionals/pro-1/contact`)
      .flush({ code: 'NOT_FOUND' }, { status: 404, statusText: 'Not Found' });
    await flush();
    fixture.detectChanges();
    expect(win.close).toHaveBeenCalled();
    expect(el.querySelector('[role="status"]')!.textContent).toContain('Este contacto ya no está disponible.');
  });
});
