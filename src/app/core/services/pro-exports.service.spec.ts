import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_URL } from '../api/api.config';
import { AuthStore } from '../state/auth.store';
import { ProExportsService, quotePdfName } from './pro-exports.service';

const API = 'http://api.test/api/v1';
const ID = '3776ae22-aaaa-bbbb-cccc-000000000000';
const flush = () => new Promise((r) => setTimeout(r));

function setup(opts: { touch: boolean; share?: (d: ShareData) => Promise<void> }) {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: q === '(pointer: coarse)' && opts.touch, media: q, addEventListener() {}, removeEventListener() {} }));
  const nav = navigator as Navigator & { canShare?: unknown; share?: unknown };
  Object.defineProperty(nav, 'share', { configurable: true, value: opts.share });
  Object.defineProperty(nav, 'canShare', { configurable: true, value: opts.share ? () => true : undefined });
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: API_URL, useValue: API },
      { provide: AuthStore, useValue: { displayName: () => 'José Pérez' } },
    ],
  });
  const clicks: string[] = [];
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    clicks.push(this.download);
  });
  URL.createObjectURL ??= () => 'blob:x';
  URL.revokeObjectURL ??= () => {};
  return { svc: TestBed.inject(ProExportsService), http: TestBed.inject(HttpTestingController), clicks };
}
const respond = (http: HttpTestingController) => http.expectOne(`${API}/pro/quotes/${ID}/pdf`).flush(new Blob(['%PDF'], { type: 'application/pdf' }));

describe('PDF del presupuesto: descargar o compartir', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete (navigator as { share?: unknown }).share;
    delete (navigator as { canShare?: unknown }).canShare;
  });

  it('nombre legible, sin acentos ni el id completo', () => {
    expect(quotePdfName(ID, 'José María Pérez')).toBe('Presupuesto-3776AE22-Jose-Maria-Perez.pdf');
    expect(quotePdfName(ID, '')).toBe('Presupuesto-3776AE22.pdf');
  });

  it('en escritorio descarga aunque el navegador sepa compartir', async () => {
    const share = vi.fn(async () => {});
    const { svc, http, clicks } = setup({ touch: false, share });
    expect(svc.canShareFiles()).toBe(false);
    const done = svc.quote(ID);
    respond(http);
    expect(await done).toBe('downloaded');
    expect(share).not.toHaveBeenCalled();
    expect(clicks).toEqual(['Presupuesto-3776AE22-Jose-Perez.pdf']);
  });

  it('en el celular abre el menú de compartir con el archivo', async () => {
    const share = vi.fn(async (_d: ShareData) => {});
    const { svc, http, clicks } = setup({ touch: true, share });
    const done = svc.quote(ID);
    respond(http);
    expect(await done).toBe('shared');
    const file = share.mock.calls[0][0].files![0];
    expect(file.name).toBe('Presupuesto-3776AE22-Jose-Perez.pdf');
    expect(file.type).toBe('application/pdf');
    expect(clicks).toEqual([]);
  });

  it('si el navegador pide otro toque, queda listo y el segundo toque comparte sin volver a bajarlo', async () => {
    let calls = 0;
    const share = vi.fn(async () => {
      if (calls++ === 0) throw Object.assign(new Error('x'), { name: 'NotAllowedError' });
    });
    const { svc, http } = setup({ touch: true, share });
    const first = svc.quote(ID);
    respond(http);
    expect(await first).toBe('needs-tap');
    expect(svc.readyToShare()).toBe(ID);
    expect(await svc.quote(ID)).toBe('shared');
    http.verify(); // sin otra descarga
    expect(svc.readyToShare()).toBeNull();
  });

  it('cancelar el menú no descarga; un error al compartir descarga', async () => {
    const { svc, http, clicks } = setup({ touch: true, share: async () => { throw Object.assign(new Error('x'), { name: 'AbortError' }); } });
    const a = svc.quote(ID);
    respond(http);
    expect(await a).toBe('cancelled');
    expect(clicks).toEqual([]);
    Object.defineProperty(navigator, 'share', { configurable: true, value: async () => { throw new TypeError('x'); } });
    const b = svc.quote(ID);
    await flush();
    respond(http);
    expect(await b).toBe('downloaded');
    expect(clicks).toHaveLength(1);
  });
});
