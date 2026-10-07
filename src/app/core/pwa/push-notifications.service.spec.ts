import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { SwPush } from '@angular/service-worker';
import { BehaviorSubject } from 'rxjs';
import { vi } from 'vitest';
import { API_URL } from '../api/api.config';
import { AuthStore } from '../state/auth.store';
import { PUSH_DISMISSED_KEY, PushNotifications } from './push-notifications.service';
import { PwaInstall } from './pwa-install.service';

const API = 'http://api.test/api/v1';
const flush = () => new Promise((r) => setTimeout(r));
const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/abc';

class FakeSwPush {
  isEnabled = true;
  subscription = new BehaviorSubject<PushSubscription | null>(null);
  requestSubscription = vi.fn(async () => {
    const sub = {
      endpoint: ENDPOINT,
      toJSON: () => ({ endpoint: ENDPOINT, keys: { p256dh: 'p', auth: 'a' } }),
    } as unknown as PushSubscription;
    this.subscription.next(sub);
    return sub;
  });
  unsubscribe = vi.fn(async () => this.subscription.next(null));
}

function setup(opts: { permission?: NotificationPermission; swEnabled?: boolean; platform?: string; installed?: boolean } = {}) {
  (globalThis as unknown as { Notification: unknown }).Notification = { permission: opts.permission ?? 'default' };
  (globalThis as unknown as { PushManager: unknown }).PushManager = function PushManager() {};
  const sw = new FakeSwPush();
  sw.isEnabled = opts.swEnabled ?? true;
  const user = signal<{ id: string } | null>(null);
  const hooks: ((r: 'logout' | 'deleted') => void)[] = [];
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: API_URL, useValue: API },
      { provide: SwPush, useValue: sw },
      {
        provide: AuthStore,
        useValue: { user, accessToken: () => 'tok', onBeforeSessionEnd: (h: (r: 'logout' | 'deleted') => void) => hooks.push(h) },
      },
      { provide: PwaInstall, useValue: { platform: signal(opts.platform ?? 'chromium'), installed: signal(opts.installed ?? false), install: vi.fn() } },
    ],
  });
  const push = TestBed.inject(PushNotifications);
  const http = TestBed.inject(HttpTestingController);
  const login = async (config = { enabled: true, publicKey: 'BKey' }) => {
    user.set({ id: 'u1' });
    TestBed.tick();
    http.expectOne(`${API}/me/push/config`).flush(config);
    await flush();
  };
  return { push, http, sw, login, hooks, user };
}

describe('PushNotifications', () => {
  beforeEach(() => localStorage.removeItem(PUSH_DISMISSED_KEY));

  it('sin sesión no sabe nada; con push apagado en el servidor no se ofrece', async () => {
    const { push, login } = setup();
    expect(push.state()).toBe('loading');
    await login({ enabled: false, publicKey: null as unknown as string });
    expect(push.state()).toBe('unavailable');
    expect(push.shouldSuggest()).toBe(false);
  });

  it('activar: pide la suscripción con la clave del servidor y la registra', async () => {
    const { push, http, sw, login } = setup();
    await login();
    expect(push.state()).toBe('off');
    expect(push.shouldSuggest()).toBe(true);
    const done = push.enable();
    await flush();
    expect(sw.requestSubscription).toHaveBeenCalledWith({ serverPublicKey: 'BKey' });
    const req = http.expectOne(`${API}/me/push/subscriptions`);
    expect(req.request.body).toEqual({ endpoint: ENDPOINT, keys: { p256dh: 'p', auth: 'a' } });
    req.flush(null);
    expect(await done).toBe('on');
    expect(push.state()).toBe('on');
  });

  it('un navegador ya suscripto pregunta si es de esta cuenta', async () => {
    const { push, http, sw, user } = setup();
    sw.subscription.next({ endpoint: ENDPOINT } as PushSubscription);
    user.set({ id: 'u1' });
    TestBed.tick();
    http.expectOne(`${API}/me/push/config`).flush({ enabled: true, publicKey: 'BKey' });
    await flush();
    const status = http.expectOne(`${API}/me/push/subscriptions/status`);
    expect(status.request.body).toEqual({ endpoint: ENDPOINT });
    status.flush({ subscribed: true });
    await flush();
    expect(push.state()).toBe('on');
  });

  it('permiso negado: queda bloqueado y lo dice', async () => {
    const { push, sw, login } = setup();
    await login();
    sw.requestSubscription.mockImplementationOnce(async () => {
      (globalThis as unknown as { Notification: { permission: string } }).Notification.permission = 'denied';
      throw new Error('denied');
    });
    expect(await push.enable()).toBe('blocked');
    expect(push.state()).toBe('blocked');
  });

  it('desactivar: baja en el servidor y en el navegador', async () => {
    const { push, http, sw, login } = setup();
    await login();
    const on = push.enable();
    await flush();
    http.expectOne(`${API}/me/push/subscriptions`).flush(null);
    await on;
    const off = push.disable();
    const req = http.expectOne(`${API}/me/push/subscriptions/remove`);
    expect(req.request.body).toEqual({ endpoint: ENDPOINT });
    req.flush(null);
    expect(await off).toBe(true);
    expect(sw.unsubscribe).toHaveBeenCalled();
    expect(push.state()).toBe('off');
  });

  it('al cerrar sesión da de baja este dispositivo; al eliminar la cuenta solo el navegador', async () => {
    const { push, http, sw, login, hooks } = setup();
    await login();
    const on = push.enable();
    await flush();
    http.expectOne(`${API}/me/push/subscriptions`).flush(null);
    await on;
    hooks.forEach((h) => h('logout'));
    http.expectOne(`${API}/me/push/subscriptions/remove`).flush(null);
    expect(sw.unsubscribe).toHaveBeenCalled();
    expect(push.state()).toBe('loading');

    await login();
    const again = push.enable();
    await flush();
    http.expectOne(`${API}/me/push/subscriptions`).flush(null);
    await again;
    hooks.forEach((h) => h('deleted'));
    http.expectNone(`${API}/me/push/subscriptions/remove`);
  });

  it('iPhone sin instalar: explica que hay que instalar la app', async () => {
    const { push, login } = setup({ swEnabled: false, platform: 'ios', installed: false });
    await login();
    expect(push.state()).toBe('ios-install');
  });

  it('"Ahora no" silencia la sugerencia por 7 días', async () => {
    const { push, login } = setup();
    await login();
    push.dismissSuggestion();
    expect(push.shouldSuggest()).toBe(false);
    localStorage.setItem(PUSH_DISMISSED_KEY, String(Date.now() - 8 * 86_400_000));
    TestBed.resetTestingModule();
    const fresh = setup();
    await fresh.login();
    expect(fresh.push.shouldSuggest()).toBe(true);
  });
});
