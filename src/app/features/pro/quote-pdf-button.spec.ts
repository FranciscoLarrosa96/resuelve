import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ProExportsService } from '../../core/services/pro-exports.service';
import { ProStore } from '../../core/state/pro.store';
import { QuotePdfButton } from './quote-pdf-button';

function render(opts: { pdf: boolean; share: boolean }) {
  const plan = signal({ entitlements: { canExportQuotePdf: opts.pdf } });
  const exports = { busy: signal(false), readyToShare: signal<string | null>(null), canShareFiles: () => opts.share, quote: vi.fn(async () => 'needs-tap') };
  TestBed.configureTestingModule({
    providers: [
      { provide: ProStore, useValue: { plan } },
      { provide: ProExportsService, useValue: exports },
    ],
  });
  const fixture = TestBed.createComponent(QuotePdfButton);
  fixture.componentRef.setInput('quoteId', 'q1');
  fixture.detectChanges();
  const button = () => fixture.nativeElement.querySelector('[data-testid="quote-pdf"]') as HTMLButtonElement | null;
  return { fixture, exports, button };
}

describe('Botón del PDF del presupuesto', () => {
  it('sin PRO no aparece', () => {
    expect(render({ pdf: false, share: true }).button()).toBeNull();
  });

  it('en escritorio dice «Descargar PDF»', () => {
    expect(render({ pdf: true, share: false }).button()!.textContent).toContain('Descargar PDF');
  });

  it('en el celular dice «Compartir PDF» y, si hace falta otro toque, «Compartir PDF ahora»', async () => {
    const { fixture, exports, button } = render({ pdf: true, share: true });
    expect(button()!.textContent).toContain('Compartir PDF');
    button()!.click();
    await Promise.resolve();
    exports.readyToShare.set('q1');
    fixture.detectChanges();
    expect(exports.quote).toHaveBeenCalledWith('q1');
    expect(button()!.textContent).toContain('Compartir PDF ahora');
  });
});
