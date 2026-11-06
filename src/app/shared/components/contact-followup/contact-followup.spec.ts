import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { API_URL } from '../../../core/api/api.config';
import { AuthStore } from '../../../core/state/auth.store';
import { ContactFollowupCards, setContactFollowupsOffline } from './contact-followup';

const API = 'http://api.test/api/v1';
const ITEM = {
  professionalId: '11111111-1111-4111-8111-111111111111',
  name: 'Juan Pérez',
  headline: 'Plomero en Tandil',
  avatarUrl: null,
  channel: 'WHATSAPP',
  contactedAt: '2026-11-01T12:00:00.000Z',
};

describe('¿Lo contrataste?', () => {
  beforeEach(() => setContactFollowupsOffline(false));
  afterEach(() => setContactFollowupsOffline(true));

  async function render(authenticated = true) {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: API_URL, useValue: API },
        { provide: AuthStore, useValue: { authenticated: signal(authenticated) } },
      ],
    });
    const fixture = TestBed.createComponent(ContactFollowupCards);
    fixture.detectChanges();
    await fixture.whenStable();
    return { fixture, http: TestBed.inject(HttpTestingController), el: fixture.nativeElement as HTMLElement };
  }

  it('sin sesión no pregunta nada', async () => {
    const { http, el } = await render(false);
    http.expectNone(`${API}/me/contact-followups`);
    expect(el.textContent?.trim()).toBe('');
  });

  it('«Sí» responde y lleva a dejar la opinión; la tarjeta desaparece', async () => {
    const { fixture, http, el } = await render();
    http.expectOne(`${API}/me/contact-followups`).flush({ items: [ITEM] });
    fixture.detectChanges();
    expect(el.textContent).toContain('¿Contrataste a Juan?');
    expect(el.textContent).toContain('le escribiste por WhatsApp');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    el.querySelector<HTMLButtonElement>('button.button-primary')!.click();
    const req = http.expectOne(`${API}/me/contact-followups/${ITEM.professionalId}/answer`);
    expect(req.request.body).toEqual({ answer: 'HIRED' });
    req.flush({ answered: true });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(navigate).toHaveBeenCalledWith(['/profesional', ITEM.professionalId, 'resenar']);
    expect(el.querySelector('[data-testid="contact-followup"]')).toBeNull();
  });

  it('«No lo contraté» la cierra sin navegar', async () => {
    const { fixture, http, el } = await render();
    http.expectOne(`${API}/me/contact-followups`).flush({ items: [ITEM] });
    fixture.detectChanges();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    el.querySelector<HTMLButtonElement>('button.button-secondary')!.click();
    const req = http.expectOne(`${API}/me/contact-followups/${ITEM.professionalId}/answer`);
    expect(req.request.body).toEqual({ answer: 'NOT_HIRED' });
    req.flush({ answered: true });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(navigate).not.toHaveBeenCalled();
    expect(el.querySelector('[data-testid="contact-followup"]')).toBeNull();
  });
});
