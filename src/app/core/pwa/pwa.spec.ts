import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { SwUpdate, VersionEvent } from '@angular/service-worker';
import { Subject } from 'rxjs';
import { API_URL } from '../api/api.config';
import { PwaPrompts } from '../../shared/components/pwa-prompts/pwa-prompts';
import { NetworkStatus, RETRY_EVENT } from './network-status';
import { PWA_DISMISSED_KEY, PWA_ENGAGED_KEY, PWA_VISITS_KEY, PwaInstall, detectPlatform } from './pwa-install.service';
import { PwaUpdate } from './pwa-update.service';

@Component({ template: '' })
class Blank {}

const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  ipadDesktop: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  macSafari16: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15',
  macChrome: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
};

/** `beforeinstallprompt` de Chromium con el resultado elegido. */
function installPrompt(outcome: 'accepted' | 'dismissed') {
  const event = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
    prompt: ReturnType<typeof vi.fn>;
    userChoice: Promise<{ outcome: string }>;
  };
  event.prompt = vi.fn(() => Promise.resolve());
  event.userChoice = Promise.resolve({ outcome });
  return event;
}

function setup(providers: unknown[] = []) {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([{ path: '**', component: Blank }]),
      { provide: API_URL, useValue: 'http://api.test/api/v1' },
      ...(providers as never[]),
    ],
  });
}

function clearStorage() {
  for (const k of [PWA_DISMISSED_KEY, PWA_ENGAGED_KEY, PWA_VISITS_KEY]) localStorage.removeItem(k);
  sessionStorage.clear();
}

describe('PWA: plataforma', () => {
  it('iPhone e iPad (aunque se presente como Mac) → instrucciones de iOS; Safari viejo, Chrome y Android sin prompt → nada', () => {
    expect(detectPlatform(UA.iphone)).toBe('ios');
    expect(detectPlatform(UA.ipadDesktop, 5)).toBe('ios');
    expect(detectPlatform(UA.ipadDesktop, 0)).toBe('mac-safari');
    expect(detectPlatform(UA.macSafari16, 0)).toBe('other');
    expect(detectPlatform(UA.macChrome)).toBe('other');
    expect(detectPlatform(UA.android)).toBe('other');
  });
});

describe('PWA: instalación', () => {
  beforeEach(() => {
    clearStorage();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });
  afterEach(() => {
    vi.useRealTimers();
    clearStorage();
  });

  it('beforeinstallprompt: sin prompt automático; "Instalar" lo lanza y acepta → instalada, sin más ofertas', async () => {
    setup();
    const pwa = TestBed.inject(PwaInstall);
    expect(pwa.canInstall()).toBe(false);
    const event = installPrompt('accepted');
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(event.prompt).not.toHaveBeenCalled();
    expect(pwa.canInstall()).toBe(true);
    expect(pwa.platform()).toBe('chromium');

    await expect(pwa.install()).resolves.toBe('accepted');
    expect(event.prompt).toHaveBeenCalledTimes(1);
    expect(pwa.installed()).toBe(true);
    expect(pwa.canInstall()).toBe(false);
  });

  it('prompt nativo cerrado = "Ahora no": no se sugiere por 7 días', async () => {
    setup();
    const pwa = TestBed.inject(PwaInstall);
    window.dispatchEvent(installPrompt('dismissed'));
    await expect(pwa.install()).resolves.toBe('dismissed');
    expect(Number(localStorage.getItem(PWA_DISMISSED_KEY))).toBeGreaterThan(0);
  });

  it('la sugerencia espera uso real (2.ª visita, pedido creado o Agenda), nunca al abrir ni en formularios; "Ahora no" la oculta', async () => {
    setup();
    const pwa = TestBed.inject(PwaInstall);
    const router = TestBed.inject(Router);
    window.dispatchEvent(installPrompt('accepted'));
    await router.navigateByUrl('/pro/dashboard');
    vi.advanceTimersByTime(25_000);
    // Primera visita, sin uso: nada.
    expect(pwa.suggest()).toBe(false);

    await router.navigateByUrl('/pro/agenda');
    TestBed.tick();
    expect(localStorage.getItem(PWA_ENGAGED_KEY)).toBe('1');
    expect(pwa.suggest()).toBe(true);

    // Formularios y checkout: nunca.
    await router.navigateByUrl('/solicitud');
    expect(pwa.suggest()).toBe(false);
    await router.navigateByUrl('/pro/solicitudes/abc/presupuesto');
    expect(pwa.suggest()).toBe(false);
    await router.navigateByUrl('/pro/plan/resultado');
    expect(pwa.suggest()).toBe(false);

    await router.navigateByUrl('/pro/agenda');
    expect(pwa.suggest()).toBe(true);
    pwa.dismiss();
    expect(pwa.suggest()).toBe(false);
    // El menú de cuenta lo sigue ofreciendo.
    expect(pwa.canInstall()).toBe(true);
  });

  it('segunda visita (otra sesión del navegador) cuenta como uso', async () => {
    localStorage.setItem(PWA_VISITS_KEY, '1');
    setup();
    const pwa = TestBed.inject(PwaInstall);
    window.dispatchEvent(installPrompt('accepted'));
    await TestBed.inject(Router).navigateByUrl('/');
    expect(pwa.suggest()).toBe(false); // recién abierta
    vi.advanceTimersByTime(25_000);
    expect(pwa.suggest()).toBe(true);
  });

  it('ya instalada (display-mode: standalone): nunca "Instalar Resuelve"', () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (q: string) => ({ matches: q === '(display-mode: standalone)', addEventListener: () => undefined, removeEventListener: () => undefined }),
    });
    setup();
    const pwa = TestBed.inject(PwaInstall);
    window.dispatchEvent(installPrompt('accepted'));
    expect(pwa.installed()).toBe(true);
    expect(pwa.canInstall()).toBe(false);
    delete (window as { matchMedia?: unknown }).matchMedia;
  });

  it('iPhone: "Instalar" abre las instrucciones (no finge un prompt nativo)', async () => {
    const ua = vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(UA.iphone);
    setup();
    const pwa = TestBed.inject(PwaInstall);
    expect(pwa.platform()).toBe('ios');
    expect(pwa.canInstall()).toBe(true);
    await expect(pwa.install()).resolves.toBe('instructions');
    expect(pwa.instructionsOpen()).toBe(true);

    const fixture = TestBed.createComponent(PwaPrompts);
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Tocá Compartir');
    expect(text).toContain('“Agregar a pantalla de inicio”');
    expect(text).toContain('Confirmá “Agregar”');
    ua.mockRestore();
  });
});

describe('PWA: sin conexión', () => {
  const setOnline = (online: boolean) => {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => online });
    window.dispatchEvent(new Event(online ? 'online' : 'offline'));
  };
  afterEach(() => setOnline(true));

  it('muestra "Sin conexión" sin errores técnicos; Reintentar relee solo si volvió la red', () => {
    setup();
    const fixture = TestBed.createComponent(PwaPrompts);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="offline-banner"]')).toBeNull();

    setOnline(false);
    fixture.detectChanges();
    const banner = el.querySelector('[data-testid="offline-banner"]')!;
    expect(banner.textContent).toContain('Sin conexión');
    expect(banner.textContent).toContain('Necesitás internet para actualizar solicitudes, presupuestos y agenda.');

    const retried = vi.fn();
    document.addEventListener(RETRY_EVENT, retried);
    const retry = () => Array.from(banner.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Reintentar')!.click();
    retry();
    fixture.detectChanges();
    expect(retried).not.toHaveBeenCalled();
    expect(el.textContent).toContain('Seguís sin conexión.');

    Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => true });
    retry();
    fixture.detectChanges();
    expect(retried).toHaveBeenCalledTimes(1);
    expect(el.querySelector('[data-testid="offline-banner"]')).toBeNull();
    expect(TestBed.inject(NetworkStatus).online()).toBe(true);
    document.removeEventListener(RETRY_EVENT, retried);
  });
});

describe('PWA: nueva versión', () => {
  it('sin service worker (dev/tests) no hace nada', () => {
    setup();
    expect(TestBed.inject(PwaUpdate).available()).toBe(false);
  });

  it('VERSION_READY → "Hay una nueva versión de Resuelve." + Actualizar (nunca recarga sola)', async () => {
    const versionUpdates = new Subject<VersionEvent>();
    const sw = {
      isEnabled: true,
      versionUpdates,
      unrecoverable: new Subject(),
      checkForUpdate: vi.fn(() => Promise.resolve(false)),
      activateUpdate: vi.fn(() => Promise.resolve(true)),
    };
    setup([{ provide: SwUpdate, useValue: sw }]);
    const update = TestBed.inject(PwaUpdate);
    const fixture = TestBed.createComponent(PwaPrompts);
    fixture.detectChanges();
    versionUpdates.next({ type: 'VERSION_DETECTED', version: { hash: 'b' } });
    expect(update.available()).toBe(false);
    versionUpdates.next({ type: 'VERSION_READY', currentVersion: { hash: 'a' }, latestVersion: { hash: 'b' } });
    fixture.detectChanges();
    const banner = (fixture.nativeElement as HTMLElement).querySelector('[data-testid="update-banner"]')!;
    expect(banner.textContent).toContain('Hay una nueva versión de Resuelve.');
    expect(banner.textContent).toContain('Actualizar');
    expect(sw.activateUpdate).not.toHaveBeenCalled();
    Array.from(banner.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Después')!.click();
    fixture.detectChanges();
    expect(update.available()).toBe(false);
  });
});
