import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { routes } from './app.routes';
import { interpretRequest } from './core/utils/interpret-request';
import { RequestStore } from './core/state/request.store';
import { SearchStore } from './core/state/search.store';
import { ClientRequestsStore } from './core/state/client-requests.store';
import { ProStore } from './core/state/pro.store';
import { findServices } from './core/data/services.data';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter(routes)],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });
});

describe('interpretRequest', () => {
  it('classifies common problems', () => {
    expect(interpretRequest('Saltan las térmicas con el horno').category).toBe('Electricidad');
    expect(interpretRequest('Me quedé afuera de casa').category).toBe('Cerrajería');
    expect(interpretRequest('El termotanque pierde agua').problem).toBe('Termotanque con pérdida');
  });
});

describe('RequestStore', () => {
  it('keeps the request created from the home text', () => {
    const store = TestBed.inject(RequestStore);
    store.setHomeText('Necesito un gasista matriculado');
    store.startFromHome();
    expect(store.draft().category).toBe('Gas');
    expect(store.draft().text).toBe('Necesito un gasista matriculado');
  });

  it('limits recipients to three', () => {
    const store = TestBed.inject(RequestStore);
    store.askProfessionals(['martin', 'luciano', 'marcelo', 'walter']);
    expect(store.recipientIds().length).toBe(3);
  });

  it('keeps urgency and date coherent in shared state', () => {
    const store = TestBed.inject(RequestStore);
    store.updateDraft({ urgency: 'today' });
    expect(store.draft().when).toBe('Hoy');
    store.updateDraft({ when: 'Mañana' });
    expect(store.draft().urgency).toBe('wait');
    store.updateDraft({ urgency: 'urgent' });
    expect(store.draft().when).toBe('Ahora');
  });

  it('resets a new request without clearing the general location', () => {
    const store = TestBed.inject(RequestStore);
    const search = TestBed.inject(SearchStore);
    store.updateDraft({ zone: 'Uncas', urgency: 'today', photos: 3 });
    store.askProfessionals(['martin']);
    store.addHomePhoto();
    search.setFilter('today', true);
    search.toggleSelected('martin');
    search.resetForNewRequest();
    store.resetForNewRequest();
    expect(store.draft().zone).toBe('Uncas');
    expect(store.draft().photos).toBe(0);
    expect(store.homePhotos()).toBe(0);
    expect(store.draft().urgency).toBe('wait');
    expect(store.recipientIds()).toEqual([]);
    expect(search.filters().today).toBe(false);
    expect(search.selectedIds()).toEqual([]);
  });
});

describe('SearchStore', () => {
  it('compares two or three professionals, never four', () => {
    const search = TestBed.inject(SearchStore);
    search.clearSelection();
    search.toggleSelected('martin');
    search.openCompare();
    expect(search.compareOpen()).toBe(false);
    search.toggleSelected('luciano');
    search.openCompare();
    expect(search.compareOpen()).toBe(true);
    search.toggleSelected('marcelo');
    search.toggleSelected('walter');
    expect(search.selectedIds()).toHaveLength(3);
  });

  it('filters availability separately from response time', () => {
    const request = TestBed.inject(RequestStore);
    const search = TestBed.inject(SearchStore);
    request.setCategory('Jardinería');
    expect(search.results().some((p) => p.id === 'oscar')).toBe(true);
    search.setFilter('today', true);
    expect(search.results().some((p) => p.id === 'oscar')).toBe(false);
  });
});

describe('request transitions', () => {
  it('requires a chosen professional before scheduling and completion before review', () => {
    const store = TestBed.inject(ClientRequestsStore);
    store.confirmDate('c1');
    store.markDone('c1');
    store.rating.set(5);
    store.submitReview('c1');
    expect(store.requests().find((r) => r.id === 'c1')?.stage).toBe(0);
    store.chooseQuote('c2', 'juan');
    expect(store.requests().find((r) => r.id === 'c2')?.stage).toBe(2);
    store.confirmDate('c2');
    expect(store.requests().find((r) => r.id === 'c2')?.stage).toBe(3);
    store.markDone('c2');
    expect(store.requests().find((r) => r.id === 'c2')?.stage).toBe(4);
    store.submitReview('c2');
    expect(store.requests().find((r) => r.id === 'c2')?.stage).toBe(5);
  });

  it('does not send a second quote to the same professional request', () => {
    const store = TestBed.inject(ProStore);
    const client = TestBed.inject(ClientRequestsStore);
    store.sendQuote('r1');
    const amount = store.byId('r1')?.quoteAmount;
    expect(client.requests().find((r) => r.id === 'c2')?.quotes?.some((q) => q.professionalId === 'juan')).toBe(true);
    store.updateQuote({ labor: 999999 });
    store.sendQuote('r1');
    expect(store.byId('r1')?.quoteAmount).toBe(amount);
  });
});

describe('service catalog', () => {
  it('finds related services locally', () => {
    expect(findServices('pasto').map((s) => s.id)).toContain('Jardinería');
    expect(findServices('flete').map((s) => s.id)).toContain('Mudanzas');
  });
});
