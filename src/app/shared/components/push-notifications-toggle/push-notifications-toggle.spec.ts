import { Type, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { PushNotifications, PushState } from '../../../core/pwa/push-notifications.service';
import { PwaInstall } from '../../../core/pwa/pwa-install.service';
import { ToastService } from '../../../core/services/toast.service';
import { PushSuggestion } from '../push-suggestion/push-suggestion';
import { PUSH_MESSAGES, PushNotificationsToggle } from './push-notifications-toggle';

const flush = () => new Promise((r) => setTimeout(r));

function setup(state: PushState, extra: { shouldSuggest?: boolean } = {}) {
  const push = {
    state: signal<PushState>(state),
    busy: signal(false),
    shouldSuggest: signal(extra.shouldSuggest ?? false),
    enable: vi.fn(async () => 'on' as const),
    disable: vi.fn(async () => true),
    dismissSuggestion: vi.fn(),
  };
  const toast = { show: vi.fn() };
  const pwa = { install: vi.fn() };
  TestBed.configureTestingModule({
    providers: [
      { provide: PushNotifications, useValue: push },
      { provide: ToastService, useValue: toast },
      { provide: PwaInstall, useValue: pwa },
    ],
  });
  return { push, toast, pwa };
}

function render<T>(component: Type<T>) {
  const fixture = TestBed.createComponent(component);
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

describe('Avisos en este dispositivo (Mi perfil)', () => {
  it.each(['loading', 'unavailable'] as const)('%s: no muestra nada', (state) => {
    setup(state);
    expect(render(PushNotificationsToggle).el.querySelector('[data-testid="push-notifications"]')).toBeNull();
  });

  it('apagado → activar pide el permiso con un toque y avisa', async () => {
    const { push, toast } = setup('off');
    const { el } = render(PushNotificationsToggle);
    const sw = el.querySelector<HTMLButtonElement>('[role="switch"]')!;
    expect(sw.getAttribute('aria-checked')).toBe('false');
    sw.click();
    await flush();
    expect(push.enable).toHaveBeenCalled();
    expect(toast.show).toHaveBeenCalledWith(PUSH_MESSAGES.on);
  });

  it('prendido → apagar da de baja este dispositivo', async () => {
    const { push, toast } = setup('on');
    const { el } = render(PushNotificationsToggle);
    el.querySelector<HTMLButtonElement>('[role="switch"]')!.click();
    await flush();
    expect(push.disable).toHaveBeenCalled();
    expect(toast.show).toHaveBeenCalledWith(PUSH_MESSAGES.off);
  });

  it('bloqueado: explica cómo habilitarlas, sin interruptor', () => {
    setup('blocked');
    const { el } = render(PushNotificationsToggle);
    expect(el.querySelector('[role="switch"]')).toBeNull();
    expect(el.querySelector('[data-testid="push-help"]')?.textContent).toContain('bloqueadas');
  });

  it('iPhone sin instalar: ofrece las instrucciones de instalación', () => {
    const { pwa } = setup('ios-install');
    const { el } = render(PushNotificationsToggle);
    expect(el.textContent).toContain('instalada en la pantalla de inicio');
    el.querySelector<HTMLButtonElement>('button')!.click();
    expect(pwa.install).toHaveBeenCalled();
  });
});

describe('Sugerencia del panel profesional', () => {
  it('solo cuando corresponde; "Ahora no" y "Activar avisos"', async () => {
    const { push, toast } = setup('off', { shouldSuggest: true });
    const { el, fixture } = render(PushSuggestion);
    expect(el.querySelector('[data-testid="push-suggestion"]')).not.toBeNull();
    el.querySelector<HTMLButtonElement>('[data-testid="push-suggestion-enable"]')!.click();
    await flush();
    expect(push.enable).toHaveBeenCalled();
    expect(toast.show).toHaveBeenCalledWith(PUSH_MESSAGES.on);
    [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Ahora no'))!.click();
    expect(push.dismissSuggestion).toHaveBeenCalled();
    push.shouldSuggest.set(false);
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="push-suggestion"]')).toBeNull();
  });
});
