import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { API_URL } from '../../../core/api/api.config';
import { OwnPlan, PlansInfo } from '../../../core/models/pro-analytics';
import { ProStore } from '../../../core/state/pro.store';
import { ProPlansPage } from './pro-plans-page';

const API = 'http://api.test/api/v1';
const FREE: OwnPlan = { tier: 'FREE', expiresAt: null, entitlements: { advancedAnalytics: false, featuredPlacement: false, quoteTemplates: false } };
const PRO: OwnPlan = { tier: 'PRO', expiresAt: '2026-12-31T02:59:59.000Z', entitlements: { advancedAnalytics: true, featuredPlacement: true, quoteTemplates: false } };
const INFO: PlansInfo = { free: { monthlyQuoteLimit: null }, pro: { monthlyPriceArs: null, selfServe: false, features: { quoteTemplates: false } } };

function render(plan: OwnPlan | null, info: PlansInfo | 'error' = INFO) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: API_URL, useValue: API },
      { provide: ProStore, useValue: { plan: signal(plan) } },
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
  it('Free útil, PRO con beneficios reales y sin precio, trial ni contratación inventados', () => {
    const host = render(FREE);
    const text = host.textContent!;
    expect(text).toContain('Más visibilidad. Más control sobre tu trabajo.');
    expect(host.querySelector('#free-title')!.parentElement!.textContent).toContain('Tu plan actual');
    for (const item of ['Perfil profesional', 'Recibir solicitudes', 'Enviar presupuestos', 'Agenda', 'Reseñas']) expect(text).toContain(item);
    expect(text).toContain('Precio a confirmar');
    expect(text).toContain('Todavía no se puede contratar desde la app');
    expect(text).toContain('Destacate cuando te buscan');
    expect(text).toContain('Entendé qué te funciona');
    // Plantillas todavía no existen: no se ofrecen.
    expect(text).not.toContain('Ahorrá tiempo');
    expect(text).not.toMatch(/14\.900|30 días gratis|Ilimitad|Probar PRO|Activar PRO|10 solicitudes|conseguís más trabajos/i);
    expect(host.querySelector('button')).toBeNull();
  });

  it('PRO actual con vencimiento solo si llegó del backend', () => {
    const host = render(PRO);
    expect(host.querySelector('#pro-title')!.parentElement!.textContent).toContain('Tu plan actual · hasta el 30 de diciembre de 2026');
    expect(host.querySelector('#free-title')!.parentElement!.textContent).not.toContain('Tu plan actual');
  });

  it('precio y límite Free configurables: se muestran solo si el backend los define', () => {
    const host = render(FREE, { free: { monthlyQuoteLimit: 25 }, pro: { ...INFO.pro, monthlyPriceArs: 15000 } });
    expect(host.textContent).toContain('$ 15.000 por mes');
    expect(host.textContent).toContain('Hasta 25 presupuestos por mes');
  });

  it('sin plan cargado no afirma ninguno; si /plans falla, el precio queda a confirmar', () => {
    const host = render(null, 'error');
    expect(host.textContent).not.toContain('Tu plan actual');
    expect(host.textContent).toContain('Precio a confirmar');
  });
});
