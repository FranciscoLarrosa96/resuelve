import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MonthAnalytics } from '../../../core/models/pro-analytics';
import { WithoutProPanel } from './without-pro-panel';

const data = (proPreview: Partial<NonNullable<MonthAnalytics['proPreview']>> | null): MonthAnalytics =>
  ({
    period: { year: 2026, month: 10, isCurrent: true },
    plan: 'FREE',
    basic: { requestsReceived: 0, quotesSent: 0, quotesAccepted: 0, scheduledJobs: 0, completedJobs: 0, reviewsReceived: 0 },
    proPreview: proPreview && {
      impressions: 0, profileViews: 0, delayedOpportunities: 0, delayedAfterOtherQuote: 0, blockedOpportunities: 0, ...proPreview,
    },
  }) as unknown as MonthAnalytics;

function render(d: MonthAnalytics, showInterest: boolean): { fixture: ComponentFixture<WithoutProPanel>; host: HTMLElement } {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(WithoutProPanel);
  fixture.componentRef.setInput('data', d);
  fixture.componentRef.setInput('showInterest', showInterest);
  fixture.detectChanges();
  return { fixture, host: fixture.nativeElement as HTMLElement };
}

describe('Mi plan (Free): resumen con visitas y toques', () => {
  it('reutiliza los totales de Tu mes, sin atribuirlos a PRO', () => {
    const { host } = render(data({ profileViews: 9, whatsappClicks: 3, phoneClicks: 1 }), true);
    const line = host.querySelector('[data-testid="without-pro-interest"]')!.textContent!.replace(/\s+/g, ' ');
    expect(line).toContain('Este mes, tu perfil recibió 9 visitas y se registraron 4 toques para contactarte.');
    expect(line).toContain('Un toque no confirma que se hayan comunicado.');
    expect(host.querySelector('[data-testid="without-pro-fact"]')).toBeNull();
    expect(host.textContent).toContain('Lo que sumarías con PRO');
  });

  it('sin actividad o sin el dato no muestra la línea; en Tu mes no se repite', () => {
    expect(render(data({}), true).host.querySelector('[data-testid="without-pro-interest"]')).toBeNull();
    TestBed.resetTestingModule();
    expect(render(data({ profileViews: 9, whatsappClicks: 3 }), false).host.querySelector('[data-testid="without-pro-interest"]')).toBeNull();
  });
});
