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
import { proRequestActions } from './features/pro/pro-ui';
import { ProRequestsPage } from './features/pro/requests/pro-requests-page';
import { ProRequestDetailPage } from './features/pro/request-detail/pro-request-detail-page';
import { HomePage } from './features/client/home/home-page';

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
    expect(store.draft().description).toBe('Necesito un gasista matriculado');
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
    // c2 solo tiene presupuesto de Carlos: elegir a alguien sin presupuesto no avanza.
    store.chooseQuote('c2', 'juan');
    expect(store.requests().find((r) => r.id === 'c2')?.stage).toBe(1);
    store.chooseQuote('c2', 'carlos');
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

describe('crear solicitud similar', () => {
  it('crea un borrador nuevo sin reutilizar la solicitud anterior', () => {
    const store = TestBed.inject(RequestStore);
    const search = TestBed.inject(SearchStore);
    const client = TestBed.inject(ClientRequestsStore);
    const original = client.requests().find((r) => r.id === 'c6')!; // cerrada, con profesional y reseña
    const before = JSON.stringify(original);

    store.askProfessionals(['carlos']);
    search.toggleSelected('carlos');
    store.updateDraft({ urgency: 'urgent', photos: 3 });
    search.resetForNewRequest();
    store.repeatFrom(original);
    const draft = store.draft();

    // Nuevo id; la solicitud original queda intacta.
    expect(draft.id).not.toBe(original.id);
    expect(draft.sourceRequestId).toBe(original.id);
    expect(JSON.stringify(client.requests().find((r) => r.id === 'c6'))).toBe(before);

    // Copia solo lo básico.
    expect(draft).toMatchObject({
      title: original.title,
      description: original.description,
      category: original.category,
      zone: original.zone,
    });

    // Todo lo demás arranca de cero.
    expect(draft.urgency).toBe('wait');
    expect(draft.when).toBe('Hoy');
    expect(draft.photos).toBe(0);
    expect(store.recipientIds()).toEqual([]);
    expect(search.selectedIds()).toEqual([]);
    expect(draft).not.toHaveProperty('chosenId');
    expect(draft).not.toHaveProperty('quotes');
    expect(draft).not.toHaveProperty('stage');

    // Lleva a "Revisá tu pedido" antes de enviar.
    expect(store.step()).toBe(5);
  });

  it('al enviarla genera una solicitud nueva, sin presupuestos ni profesional', async () => {
    const store = TestBed.inject(RequestStore);
    const client = TestBed.inject(ClientRequestsStore);
    const original = client.requests().find((r) => r.id === 'c6')!;
    store.repeatFrom(original);
    store.askProfessionals(['pablo']);
    expect(await store.send()).toBe(true);
    const created = client.requests()[0];
    expect(created.id).not.toBe(original.id);
    expect(created.stage).toBe(0);
    expect(created.quotes).toBeUndefined();
    expect(created.chosenId).toBeUndefined();
    expect(created.myRating).toBeUndefined();
    expect(client.requests().filter((r) => r.id === 'c6')).toHaveLength(1);
  });

  it('cada borrador nuevo tiene un id distinto', () => {
    const store = TestBed.inject(RequestStore);
    const first = store.draft().id;
    store.resetForNewRequest();
    const second = store.draft().id;
    store.resetForNewRequest();
    expect(new Set([first, second, store.draft().id]).size).toBe(3);
  });
});

describe('título y descripción del pedido', () => {
  it('la descripción y el título se pueden editar', () => {
    const store = TestBed.inject(RequestStore);
    store.setHomeText('Me pierde agua abajo de la pileta');
    store.startFromHome();
    store.updateDescription('Pierde agua abajo de la pileta y se moja el mueble');
    store.updateTitle('Pérdida en la cocina');
    expect(store.draft().description).toBe('Pierde agua abajo de la pileta y se moja el mueble');
    expect(store.draft().title).toBe('Pérdida en la cocina');
    expect(store.draft().category).toBe('Plomería');
    store.updateTitle('   ');
    expect(store.draft().title).toBe('Pérdida en la cocina');
  });

  it('elegir un servicio directamente no arrastra la descripción de ejemplo', () => {
    const store = TestBed.inject(RequestStore);
    store.resetForNewRequest();
    store.setCategory('Electricidad');
    expect(store.draft().description).toBe('');
    expect(store.draft().title).toBe('Problema eléctrico');
  });

  it('cambiar la descripción no deja un servicio viejo incoherente', () => {
    const store = TestBed.inject(RequestStore);
    store.resetForNewRequest();
    store.setCategory('Electricidad');
    store.goToStep(5);
    const changed = store.updateDescription('Tengo una pérdida abajo de la pileta');
    expect(changed).toBe(true);
    expect(store.draft().category).toBe('Plomería');
    expect(store.draft().title).toBe('Pérdida bajo mesada');
    expect(store.step()).toBe(0); // vuelve a confirmar el servicio
  });

  it('un texto que no se reconoce no cambia el servicio elegido', () => {
    const store = TestBed.inject(RequestStore);
    store.resetForNewRequest();
    store.setCategory('Electricidad');
    expect(store.updateDescription('Necesito que venga el jueves')).toBe(false);
    expect(store.draft().category).toBe('Electricidad');
  });
});

describe('acciones del profesional', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideRouter(routes)] }));

  const texts = (el: HTMLElement) =>
    Array.from(el.querySelectorAll('a, button')).map((n) => (n.textContent ?? '').trim());

  it('una solicitud estándar ofrece presupuesto, nunca Aceptar ni Tomar trabajo', () => {
    for (const urgency of ['Para hoy', 'Puede esperar'] as const) {
      const actions = proRequestActions({ status: 'new', urgency })!;
      expect(actions.primary).toEqual({ kind: 'quote', label: 'Enviar presupuesto' });
      expect(actions.secondary.label).toBe('No disponible');
    }
  });

  it('una urgencia real permite Tomar trabajo', () => {
    expect(proRequestActions({ status: 'new', urgency: 'Urgente' })!.primary).toEqual({ kind: 'take', label: 'Tomar trabajo' });
    expect(proRequestActions({ status: 'quoted', urgency: 'Urgente' })).toBeNull();
  });

  it('la vista previa de /pro/solicitudes no muestra Aceptar en una solicitud "Para hoy"', async () => {
    const fixture = TestBed.createComponent(ProRequestsPage);
    await fixture.whenStable();
    const labels = texts(fixture.nativeElement);
    expect(labels).toContain('Enviar presupuesto');
    expect(labels).toContain('No disponible');
    expect(labels.some((t) => /^Aceptar|Tomar trabajo/.test(t))).toBe(false);
  });

  it('el detalle (desktop y mobile) de una urgencia ofrece Tomar trabajo y no Aceptar', async () => {
    const fixture = TestBed.createComponent(ProRequestDetailPage);
    fixture.componentRef.setInput('id', 'r2'); // "Urgente"
    await fixture.whenStable();
    const labels = texts(fixture.nativeElement);
    expect(labels.filter((t) => t === 'Tomar trabajo')).toHaveLength(2);
    expect(labels.filter((t) => t === 'No disponible')).toHaveLength(2);
    expect(labels.some((t) => /^Aceptar/.test(t))).toBe(false);
  });

  it('el detalle de una solicitud estándar no ofrece Tomar trabajo', async () => {
    const fixture = TestBed.createComponent(ProRequestDetailPage);
    fixture.componentRef.setInput('id', 'r1'); // "Para hoy"
    await fixture.whenStable();
    const labels = texts(fixture.nativeElement);
    expect(labels).not.toContain('Tomar trabajo');
    expect(labels.filter((t) => t === 'Enviar presupuesto')).toHaveLength(2);
  });
});

describe('home', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideRouter(routes)] }));

  it('"Ver todos los profesionales" lleva a resultados de profesionales', async () => {
    const fixture = TestBed.createComponent(HomePage);
    await fixture.whenStable();
    const link = Array.from<HTMLAnchorElement>(fixture.nativeElement.querySelectorAll('a')).find((a) =>
      (a.textContent ?? '').includes('Ver todos los profesionales'),
    );
    expect(link).toBeTruthy();
    expect(link!.getAttribute('href')).toBe('/profesionales');
    expect(fixture.nativeElement.textContent).not.toContain('Ver todos los servicios');
  });
});
