import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SiteFooter } from './site-footer';

describe('SiteFooter', () => {
  it('muestra Tandil, enlaces legales y autor externo seguro también en mobile', () => {
    TestBed.configureTestingModule({ imports: [SiteFooter], providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(SiteFooter);
    fixture.componentRef.setInput('mobileNav', true);
    fixture.detectChanges();

    const footer = fixture.nativeElement.querySelector('footer') as HTMLElement;
    const links = [...footer.querySelectorAll<HTMLAnchorElement>('a')];
    expect(footer.textContent).toContain('Resuelve');
    expect(footer.textContent).toContain('Profesionales locales para resolver lo que necesitás.');
    expect(footer.textContent).toContain('Tandil · Argentina');
    expect(links.find((link) => link.textContent?.includes('Términos de Uso'))?.getAttribute('href')).toBe('/terminos');
    expect(links.find((link) => link.textContent?.includes('Política de Privacidad'))?.getAttribute('href')).toBe('/privacidad');
    const author = links.find((link) => link.textContent?.includes('Designed by Francisco Larrosa'))!;
    expect(author.getAttribute('href')).toBe('https://franciscolarrosa.com.ar');
    expect(author.getAttribute('target')).toBe('_blank');
    expect(author.getAttribute('rel')).toContain('noopener');
    expect(footer.className).toContain('max-lg:pb-21');
    expect(footer.className).toContain('bg-primary-deep');
  });

  it('enlaza las páginas por oficio ("Gasistas en Tandil") y no las repite en la versión compacta', () => {
    TestBed.configureTestingModule({ imports: [SiteFooter], providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(SiteFooter);
    fixture.detectChanges();
    const nav = fixture.nativeElement.querySelector('nav[aria-labelledby="footer-services"]') as HTMLElement;
    const hrefs = [...nav.querySelectorAll('a')].map((a) => [a.textContent!.trim(), a.getAttribute('href')]);
    expect(hrefs).toContainEqual(['Gasistas en Tandil', '/servicios/gas']);
    expect(hrefs).toContainEqual(['Electricistas en Tandil', '/servicios/electricidad']);
    expect(hrefs.at(-1)).toEqual(['Todos los servicios', '/servicios']);

    fixture.componentRef.setInput('compact', true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('nav[aria-labelledby="footer-services"]')).toBeNull();
  });
});
