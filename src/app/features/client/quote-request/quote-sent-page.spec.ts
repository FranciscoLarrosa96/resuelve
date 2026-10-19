import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PushNotifications } from '../../../core/pwa/push-notifications.service';
import { RequestStore } from '../../../core/state/request.store';
import { ServiceRequest } from '../../../core/models/request';
import { QuoteSentPage } from './quote-sent-page';

function setup(invited: number | null, suggest = true) {
  const dismissed = signal(false);
  const enabled = signal(false);
  const push = {
    shouldSuggest: computed(() => suggest && !dismissed() && !enabled()),
    busy: signal(false),
    enable: vi.fn(async () => { enabled.set(true); return 'on'; }),
    dismissSuggestion: vi.fn(() => dismissed.set(true)),
  };
  const lastCreated = signal(invited === null ? null : {
    id: 'request-test', status: invited ? 'WAITING_QUOTES' : 'DRAFT', service: { name: 'Plomería' },
    invitations: Array.from({ length: invited }, () => ({ professional: { displayName: 'Ana Prueba' } })),
  } as unknown as ServiceRequest);
  TestBed.configureTestingModule({ providers: [provideRouter([]),
    { provide: RequestStore, useValue: { lastCreated } }, { provide: PushNotifications, useValue: push },
  ] });
  const fixture = TestBed.createComponent(QuoteSentPage);
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement, push };
}

describe('Avisos después de enviar el pedido', () => {
  it('ofrece activarlos en móvil y escritorio solo por acción explícita, con títulos únicos', async () => {
    const { fixture, el, push } = setup(1);
    const sections = [...el.querySelectorAll('[data-testid="push-suggestion"]')];
    expect(sections).toHaveLength(2);
    const ids = sections.map((s) => s.getAttribute('aria-labelledby'));
    expect(new Set(ids).size).toBe(2);
    for (const section of sections) {
      expect(section.textContent).toContain('Enterate cuando te respondan');
      expect(section.textContent).toContain('De 23 a 8 esperan a la mañana');
    }
    expect(push.enable).not.toHaveBeenCalled();
    el.querySelector<HTMLButtonElement>('[data-testid="push-suggestion-enable"]')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(push.enable).toHaveBeenCalledTimes(1);
    expect(el.querySelector('[data-testid="push-suggestion"]')).toBeNull();
  });

  it('Ahora no oculta ambas versiones y mantiene el acceso a la solicitud', () => {
    const { fixture, el, push } = setup(2);
    [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Ahora no')!.click();
    fixture.detectChanges();
    expect(push.dismissSuggestion).toHaveBeenCalledTimes(1);
    expect(el.querySelector('[data-testid="push-suggestion"]')).toBeNull();
    expect(el.querySelector('a[href="/mis-solicitudes/request-test"]')).not.toBeNull();
  });

  it.each([0, null])('no ofrece avisos si no hubo un envío confirmado: %s', (invited) => {
    const { el, push } = setup(invited);
    expect(el.querySelector('[data-testid="push-suggestion"]')).toBeNull();
    expect(push.enable).not.toHaveBeenCalled();
  });

  it('respeta la decisión del servicio si ya están activos, bloqueados o se descartó la sugerencia', () => {
    const { el } = setup(1, false);
    expect(el.querySelector('[data-testid="push-suggestion"]')).toBeNull();
  });
});
