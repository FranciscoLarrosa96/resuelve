import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { API_URL } from '../../../core/api/api.config';
import { Entitlements, OwnPlan, PlansInfo, QuoteUsage } from '../../../core/models/pro-analytics';
import { ProStore } from '../../../core/state/pro.store';
import { ProPlansPage } from './pro-plans-page';

const API = 'http://api.test/api/v1';
const ent = (pro: boolean): Entitlements => ({
  canSendUnlimitedQuotes: pro,
  canBeFeatured: pro,
  canUseAdvancedAnalytics: pro,
  canSeeExposureAnalytics: pro,
  canUseQuoteTemplates: false,
});
const FREE: OwnPlan = { tier: 'FREE', expiresAt: null, entitlements: ent(false) };
const PRO: OwnPlan = { tier: 'PRO', expiresAt: '2026-12-31T02:59:59.000Z', entitlements: ent(true) };
const INFO: PlansInfo = { free: { monthlyQuoteLimit: 10 }, pro: { monthlyPriceArs: 19000, selfServe: false, features: { quoteTemplates: false } } };
const USAGE: QuoteUsage = { period: { year: 2026, month: 9 }, used: 7, limit: 10, remaining: 3 };

function render(plan: OwnPlan | null, info: PlansInfo | 'error' = INFO, usage: QuoteUsage | null = null) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: API_URL, useValue: API },
      { provide: ProStore, useValue: { plan: signal(plan), ownProfile: signal(usage ? { quoteUsage: usage } : null) } },
    ],
  });
  const fixture = TestBed.createComponent(ProPlansPage);
  const req = TestBed.inject(HttpTestingController).expectOne(`${API}/plans`);
  if (info === 'error') req.flush(null, { status: 500, statusText: 'Error' });
  else req.flush(info);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('página de planes', () => {
  it('precio real $19.000 / mes, Free con 10 presupuestos y PRO sin límite; sin trial ni checkout', () => {
    const host = render(FREE, INFO, USAGE);
    const text = host.textContent!;
    expect(text).toContain('Más oportunidades para aprovechar. Más información para decidir.');
    expect(host.querySelector('[data-testid="pro-price"]')!.textContent).toBe('$19.000 / mes');
    expect(text).toContain('Contratación online próximamente');
    const free = host.querySelector('#free-title')!.parentElement!.textContent!;
    for (const item of ['Solicitudes sin límite', '10 presupuestos por mes', 'Tu mes básico', 'Tu plan actual', '7 de 10']) expect(free).toContain(item);
    const pro = host.querySelector('#pro-title')!.parentElement!.textContent!;
    for (const item of ['$19.000 / mes', 'Presupuestos sin límite', 'Métricas de exposición', 'Embudo de oportunidades', 'Tu mes completo'])
      expect(pro).toContain(item);
    for (const h of ['Aprovechá todas las oportunidades', 'Destacate cuando te buscan', 'Entendé qué te funciona']) expect(text).toContain(h);
    expect(text).not.toContain('Ahorrá tiempo'); // plantillas: todavía no existen
    expect(text).not.toMatch(/a confirmar|días gratis|Probar PRO|Activar PRO|garantizad|asegurad|multiplicá/i);
    expect(host.querySelector('button')).toBeNull();
  });

  it('comparación: recibir sin límite en ambos; presupuestar 10 / mes vs. sin límite; métricas solo PRO', () => {
    const host = render(FREE);
    const row = (label: string) =>
      [...host.querySelectorAll('tbody tr')].find((tr) => tr.querySelector('th')!.textContent!.trim() === label)!;
    const cells = (label: string) => [...row(label).querySelectorAll('td')].map((td) => td.textContent!.trim());
    expect(cells('Recibir solicitudes')).toEqual(['Sin límite', 'Sin límite']);
    expect(cells('Presupuestar')).toEqual(['10 / mes', 'Sin límite']);
    expect(cells('Métricas de exposición')).toEqual(['—No incluido', '✓Incluido']);
  });

  it('PRO actual con vencimiento solo si llegó del backend; sin "próximamente" en su tarjeta', () => {
    const host = render(PRO);
    const pro = host.querySelector('#pro-title')!.parentElement!.textContent!;
    expect(pro).toContain('Tu plan actual · hasta el 30 de diciembre de 2026');
    expect(host.querySelector('#free-title')!.parentElement!.textContent).not.toContain('Tu plan actual');
  });

  it('configurable: otro precio y otro cupo salen del backend', () => {
    const host = render(FREE, { free: { monthlyQuoteLimit: 25 }, pro: { ...INFO.pro, monthlyPriceArs: 21500 } });
    expect(host.textContent).toContain('$21.500 / mes');
    expect(host.textContent).toContain('25 presupuestos por mes');
  });

  it('sin plan cargado no afirma ninguno; si /plans falla no inventa un precio', () => {
    const host = render(null, 'error');
    expect(host.textContent).not.toContain('Tu plan actual');
    expect(host.querySelector('[data-testid="pro-price"]')).toBeNull();
    expect(host.textContent).not.toContain('a confirmar');
  });
});
