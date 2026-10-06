import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { API_URL } from '../../../core/api/api.config';
import { ReportReviewDialog } from './report-review-dialog';

function setup() {
  HTMLDialogElement.prototype.showModal ??= function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close ??= function () { this.removeAttribute('open'); };
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), { provide: API_URL, useValue: '/api' }],
  });
  const fixture = TestBed.createComponent(ReportReviewDialog);
  fixture.componentRef.setInput('reviewId', 'rev-1');
  fixture.detectChanges();
  return { fixture, http: TestBed.inject(HttpTestingController), el: fixture.nativeElement as HTMLElement };
}

describe('ReportReviewDialog', () => {
  it('no se puede enviar sin elegir un motivo', () => {
    const { el } = setup();
    expect((el.querySelector('[data-testid="report-submit"]') as HTMLButtonElement).disabled).toBe(true);
    expect(el.querySelectorAll('input[type="radio"]')).toHaveLength(4);
  });

  it('envía motivo y detalle, y aclara que no se oculta sola', async () => {
    const { fixture, http, el } = setup();
    await fixture.whenStable();
    (el.querySelectorAll('input[type="radio"]')[0] as HTMLInputElement).click();
    const details = el.querySelector('textarea') as HTMLTextAreaElement;
    details.value = ' Nunca trabajó conmigo. ';
    details.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    (el.querySelector('[data-testid="report-submit"]') as HTMLButtonElement).click();
    const req = http.expectOne('/api/reviews/rev-1/report');
    expect(req.request.body).toEqual({ reason: 'FAKE', details: 'Nunca trabajó conmigo.' });
    req.flush({ reported: true });
    fixture.detectChanges();
    expect(el.textContent).toContain('Gracias por avisarnos');
    expect(el.textContent).toContain('Vamos a revisar la reseña');
  });

  it('un 409 explica que no puede reportar su propia reseña', async () => {
    const { fixture, http, el } = setup();
    await fixture.whenStable();
    (el.querySelectorAll('input[type="radio"]')[3] as HTMLInputElement).click();
    fixture.detectChanges();
    (el.querySelector('[data-testid="report-submit"]') as HTMLButtonElement).click();
    http.expectOne('/api/reviews/rev-1/report').flush({}, { status: 409, statusText: 'Conflict' });
    fixture.detectChanges();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('tu propia reseña');
  });
});
