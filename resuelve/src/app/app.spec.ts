import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { routes } from './app.routes';
import { interpretRequest } from './core/utils/interpret-request';
import { RequestStore } from './core/state/request.store';

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
});
