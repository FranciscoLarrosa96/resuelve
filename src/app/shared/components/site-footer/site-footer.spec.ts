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
    expect(footer.textContent).toContain('Resuelve · Tandil');
    expect(links.find((link) => link.textContent?.includes('Términos de Uso'))?.getAttribute('href')).toBe('/terminos');
    expect(links.find((link) => link.textContent?.includes('Política de Privacidad'))?.getAttribute('href')).toBe('/privacidad');
    const author = links.find((link) => link.textContent?.includes('Designed by Francisco Larrosa'))!;
    expect(author.getAttribute('href')).toBe('https://franciscolarrosa.com.ar');
    expect(author.getAttribute('target')).toBe('_blank');
    expect(author.getAttribute('rel')).toContain('noopener');
    expect(footer.className).toContain('max-lg:pb-21');
  });
});
