import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Meta } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { API_URL } from '../../core/api/api.config';
import { routes } from '../../app.routes';
import { ClientShell } from '../../layout/client-shell/client-shell';
import { RegisterPage } from '../auth/register-page';
import { PRIVACY_SECTIONS, PrivacyPage } from './privacy-page';

const API = 'http://api.test/api/v1';

function setup() {
  TestBed.configureTestingModule({
    providers: [provideRouter(routes), provideHttpClient(), provideHttpClientTesting(), { provide: API_URL, useValue: API }],
  });
}

describe('Política de Privacidad (/privacidad)', () => {
  beforeEach(() => sessionStorage.clear());

  it('carga sin sesión, con título y description propios', async () => {
    setup();
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/privacidad');
    await harness.fixture.whenStable();
    harness.detectChanges();
    const root = harness.routeNativeElement as HTMLElement;
    expect(root.querySelector('app-privacy-page h1')?.textContent).toBe('Política de Privacidad');
    expect(document.title).toBe('Política de Privacidad | Resuelve');
    expect(TestBed.inject(Meta).getTag('name="description"')?.content).toContain('Qué datos trata Resuelve');
  });

  it('headings semánticos: un H1 y un H2 por sección, con índice que apunta a cada ancla', () => {
    setup();
    const fixture = TestBed.createComponent(PrivacyPage);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelectorAll('h1')).toHaveLength(1);
    expect(el.querySelector('h1')?.textContent).toBe('Política de Privacidad');
    for (const s of PRIVACY_SECTIONS) {
      const h2 = el.querySelector(`article h2#${s.id}`);
      expect(h2?.textContent).toBe(s.title);
      expect(el.querySelector(`nav a[href="/privacidad#${s.id}"]`)).not.toBeNull();
    }
  });

  it('no inventa datos legales: placeholders visibles y aviso de borrador', () => {
    setup();
    const fixture = TestBed.createComponent(PrivacyPage);
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent!;
    for (const ph of ['[RAZÓN SOCIAL / RESPONSABLE]', '[DOMICILIO LEGAL]', '[EMAIL DE PRIVACIDAD]', '[FECHA]']) {
      expect(text).toContain(ph);
    }
    expect(text).toContain('Versión preliminar en revisión.');
    expect(text).not.toMatch(/CUIT|cumple con toda|100% segur|seguridad absoluta|bases? (están )?registradas/i);
  });

  it('cuenta lo que Resuelve hace: tarjeta en Mercado Pago, documentos privados, sin cookies propias', () => {
    setup();
    const fixture = TestBed.createComponent(PrivacyPage);
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent!.replace(/\s+/g, ' ');
    expect(text).toContain('Resuelve no recibe ni almacena números de tarjeta ni códigos de seguridad (CVV).');
    expect(text).toContain('no se muestran públicamente, salvo datos derivados como el estado "Matrícula verificada"');
    expect(text).toContain('Resuelve no usa cookies propias');
    expect(text).toContain('No guardamos coordenadas');
    expect(text).toContain('ni te enviamos newsletters o emails de marketing');
  });

  it('el enlace a la AAIP es externo, seguro y avisa que abre otra pestaña', () => {
    setup();
    const fixture = TestBed.createComponent(PrivacyPage);
    fixture.detectChanges();
    const a = (fixture.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>('a[href^="https://www.argentina.gob.ar/aaip"]')!;
    expect(a.getAttribute('href')).toBe('https://www.argentina.gob.ar/aaip/datospersonales');
    expect(a.target).toBe('_blank');
    expect(a.rel).toContain('noopener');
    expect(a.textContent).toContain('se abre en una pestaña nueva');
  });

  it('el pie público lleva a /privacidad (y no enlaza Términos todavía)', () => {
    setup();
    const fixture = TestBed.createComponent(ClientShell);
    fixture.detectChanges();
    const footer = (fixture.nativeElement as HTMLElement).querySelector('footer')!;
    const links = [...footer.querySelectorAll('a')];
    expect(links.map((l) => [l.textContent!.trim(), l.getAttribute('href')])).toEqual([['Privacidad', '/privacidad']]);
    TestBed.inject(HttpTestingController).match(() => true);
  });

  it('el registro menciona la política sin checkbox obligatorio', () => {
    setup();
    const fixture = TestBed.createComponent(RegisterPage);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    const note = el.querySelector('[data-testid="privacy-note"]')!;
    expect(note.textContent).toContain('Consultá cómo tratamos tus datos');
    expect(note.querySelector('a')?.getAttribute('href')).toBe('/privacidad');
    expect(el.querySelector('input[type="checkbox"]')).toBeNull();
  });
});
