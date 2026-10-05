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
import { TERMS_SECTIONS, TERMS_VERSION, TermsPage } from './terms-page';

const API = 'http://api.test/api/v1';

function setup() {
  TestBed.configureTestingModule({
    providers: [provideRouter(routes), provideHttpClient(), provideHttpClientTesting(), { provide: API_URL, useValue: API }],
  });
}

function render(): string {
  setup();
  const fixture = TestBed.createComponent(TermsPage);
  fixture.detectChanges();
  return (fixture.nativeElement as HTMLElement).textContent!.replace(/\s+/g, ' ');
}

describe('Términos de Uso (/terminos)', () => {
  beforeEach(() => sessionStorage.clear());

  it('carga sin sesión, con título y description propios', async () => {
    setup();
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/terminos');
    await harness.fixture.whenStable();
    harness.detectChanges();
    const root = harness.routeNativeElement as HTMLElement;
    expect(root.querySelector('app-terms-page h1')?.textContent).toBe('Términos de Uso');
    expect(document.title).toBe('Términos de Uso | Resuelve');
    expect(TestBed.inject(Meta).getTag('name="description"')?.content).toContain('Las reglas para usar Resuelve');
  });

  it('headings semánticos: un H1 y un H2 por sección, con índice que apunta a cada ancla', () => {
    setup();
    const fixture = TestBed.createComponent(TermsPage);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelectorAll('h1')).toHaveLength(1);
    for (const s of TERMS_SECTIONS) {
      expect(el.querySelector(`article h2#${s.id}`)?.textContent).toBe(s.title);
      expect(el.querySelector(`nav a[href="/terminos#${s.id}"]`)).not.toBeNull();
    }
  });

  it('muestra la versión vigente (la misma que guarda el backend al registrarse)', () => {
    setup();
    const fixture = TestBed.createComponent(TermsPage);
    fixture.detectChanges();
    const time = (fixture.nativeElement as HTMLElement).querySelector('header time')!;
    expect(time.getAttribute('datetime')).toBe('2026-09-30');
    expect(TERMS_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}(?:\.\d+)?$/);
  });

  it('muestra los datos legales proporcionados y no muestra placeholders ni un email de contacto', () => {
    const text = render();
    expect(text).toContain('Francisco Larrosa, CUIT 20-39550730-4, con domicilio en Tandil, Provincia de Buenos Aires, Argentina.');
    expect(text).not.toMatch(/\[[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ /_-]*\]/);
    expect(text).not.toMatch(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|mailto:/i);
    expect(text).not.toContain('Versión preliminar en revisión.');
    expect(text).not.toContain('Contacto');
  });

  it('rol de Resuelve: intermedia, no hace el trabajo ni cobra el pago del trabajo', () => {
    const text = render();
    expect(text).toContain('Resuelve no presta los servicios que se ofrecen en la plataforma.');
    expect(text).toContain('el acuerdo por ese trabajo es entre vos y el profesional que elegiste');
    expect(text).toContain('Resuelve no procesa actualmente el pago del servicio contratado entre Cliente y Profesional');
    expect(text).toContain('No es un servicio de emergencias.');
  });

  it('PRO: precio, promo con el precio posterior, renovación, cancelación y arrepentimiento separados', () => {
    const text = render();
    expect(text).toContain('El precio vigente es de $15.000 por mes');
    expect(text).toContain('$12.000 el primer mes y luego $15.000 por mes');
    expect(text).toContain('se renueva automáticamente cada mes, al precio vigente, hasta que lo canceles');
    expect(text).toContain('conservás PRO hasta el final del período que ya pagaste');
    expect(text).toContain('Cancelar la renovación no es lo mismo que arrepentirse de la contratación.');
    expect(text).toContain('Mi plan → Botón de arrepentimiento');
    expect(text).toContain('te devolvemos lo que pagaste por el mismo medio de pago');
    expect(text).toContain('cinco oportunidades discovery distintas en total');
    expect(text).toContain('PRO no garantiza recibir solicitudes');
    expect(text).toContain('no representa necesariamente lo que efectivamente cobraste');
  });

  it('sin garantías inventadas, precios viejos ni cláusulas absolutas', () => {
    const text = render();
    expect(text).not.toMatch(/100 ?%|trabajo garantizado|mejor precio|profesional seguro|nunca será responsable|\$19\.000|\$15\.200|arbitraje|jurisdicción exclusiva/i);
    expect(text).toContain('Nada de estos Términos limita derechos o responsabilidades que no puedan excluirse legalmente');
  });

  it('enlaza la Política de Privacidad', () => {
    setup();
    const fixture = TestBed.createComponent(TermsPage);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('article a[href="/privacidad"]')).not.toBeNull();
  });

  it('el pie público lleva a Términos y Privacidad, una vez cada uno', () => {
    setup();
    const fixture = TestBed.createComponent(ClientShell);
    fixture.detectChanges();
    const footer = (fixture.nativeElement as HTMLElement).querySelector('footer')!;
    const links = [...footer.querySelectorAll('a')];
    expect(links.map((l) => [l.textContent!.trim(), l.getAttribute('href')])).toEqual([
      ['Términos de Uso', '/terminos'],
      ['Política de Privacidad', '/privacidad'],
      ['Designed by Francisco Larrosa', 'https://franciscolarrosa.com.ar'],
    ]);
    TestBed.inject(HttpTestingController).match(() => true);
  });

  it('el registro abre Términos y Privacidad en modal sin perder el formulario', () => {
    setup();
    const fixture = TestBed.createComponent(RegisterPage);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    const note = el.querySelector('[data-testid="legal-note"]')!;
    expect(note.textContent!.replace(/\s+/g, ' ')).toContain('Al crear tu cuenta, aceptás los Términos de Uso');
    const fields = [...el.querySelectorAll<HTMLInputElement>('input')];
    fields[0].value = 'Ana';
    fields[0].dispatchEvent(new Event('input'));
    const buttons = [...note.querySelectorAll<HTMLButtonElement>('button')];
    expect(buttons.map((b) => b.textContent!.trim())).toEqual(['Términos de Uso', 'Política de Privacidad']);
    buttons[0].click();
    fixture.detectChanges();
    const termsDialog = el.querySelector('dialog[open]')!;
    expect(termsDialog.textContent).toContain('Términos de Uso');
    expect(termsDialog.textContent).toContain('Francisco Larrosa');
    expect(termsDialog.textContent).toContain('20-39550730-4');
    expect(termsDialog.textContent).toContain('Tandil, Provincia de Buenos Aires, Argentina');
    expect(termsDialog.textContent).not.toMatch(/\[[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ /_-]*\]/);
    expect(termsDialog.textContent).not.toMatch(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|mailto:/i);
    (el.querySelector('button[aria-label="Cerrar"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fields[0].value).toBe('Ana');
    buttons[1].click();
    fixture.detectChanges();
    const privacyDialog = el.querySelector('dialog[open]')!;
    expect(privacyDialog.textContent).toContain('Política de Privacidad');
    expect(privacyDialog.textContent).toContain('30 de septiembre de 2026');
    expect(privacyDialog.textContent).toContain('Francisco Larrosa');
    expect(privacyDialog.textContent).toContain('Tandil, Provincia de Buenos Aires, Argentina');
    expect(privacyDialog.textContent).not.toMatch(/\[[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ /_-]*\]/);
    expect(privacyDialog.textContent).not.toMatch(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|mailto:/i);
    expect(el.querySelector('dialog')?.getAttribute('aria-labelledby')).toBe('legal-modal-title');
    expect(el.querySelector('input[type="checkbox"]')).toBeNull();
  });
});
