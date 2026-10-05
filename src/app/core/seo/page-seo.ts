import { DOCUMENT, isPlatformServer } from '@angular/common';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { Meta } from '@angular/platform-browser';
import { ActivatedRouteSnapshot, NavigationEnd, Router, TitleStrategy } from '@angular/router';
import { filter } from 'rxjs';
import { environment } from '../../../environments/environment';
import { PublicLinks } from '../acquisition/public-links';

/**
 * SEO por ruta (`data.seo`). Regla única y conservadora:
 *  - `{ description? }` → página pública indexable (canonical, Open Graph). Sin `description`, la página
 *    pone la suya (legales);
 *  - `'profile'`       → la maneja ProfileSeo (perfil público);
 *  - sin `seo`         → privada o transaccional: `noindex, nofollow` y sin canonical.
 * Así una pantalla nueva nunca queda indexada por olvido.
 */
export type RouteSeo = { description?: string } | 'profile';

const SITE_NAME = 'Resuelve';
/** Imagen para compartir (1200×630, public/og-image.png): WhatsApp, redes y buscadores. */
export const SHARE_IMAGE = '/og-image.png';

@Injectable({ providedIn: 'root' })
export class PageSeo {
  private readonly router = inject(Router);
  private readonly meta = inject(Meta);
  private readonly doc = inject(DOCUMENT);
  private readonly links = inject(PublicLinks);
  private readonly titleStrategy = inject(TitleStrategy);
  private readonly server = isPlatformServer(inject(PLATFORM_ID));

  constructor() {
    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe(() => this.apply(this.deepest(this.router.routerState.snapshot.root)));
  }

  private deepest(route: ActivatedRouteSnapshot): ActivatedRouteSnapshot {
    let current = route;
    while (current.firstChild) current = current.firstChild;
    return current;
  }

  private apply(route: ActivatedRouteSnapshot): void {
    const seo = route.data['seo'] as RouteSeo | undefined;
    if (seo === 'profile') return;
    if (!seo) {
      this.setRobots(false);
      this.setCanonical(null);
      this.clearSocial();
      return;
    }
    // El título lo pone el TitleStrategy después de NavigationEnd: se calcula igual para no usar uno viejo.
    const title = this.titleStrategy.buildTitle(this.router.routerState.snapshot) ?? this.doc.title;
    // En el prerender (build) el origen es el del servidor local: sin PUBLIC origin real no hay URL absoluta.
    const origin = this.server && !environment.publicAppUrl ? '' : this.links.origin;
    const url = origin ? origin + this.router.url.split(/[?#]/)[0] : '';
    const description = seo.description ?? this.meta.getTag('name="description"')?.content ?? '';
    this.setRobots(true);
    if (seo.description) this.meta.updateTag({ name: 'description', content: seo.description });
    this.setCanonical(url || null);
    const social: Record<string, string> = {
      'og:site_name': SITE_NAME,
      'og:locale': 'es_AR',
      'og:type': 'website',
      'og:title': title,
      'og:description': description,
    };
    if (url) {
      social['og:url'] = url;
      social['og:image'] = origin + SHARE_IMAGE;
      social['og:image:width'] = '1200';
      social['og:image:height'] = '630';
      social['og:image:alt'] = 'Resuelve: profesionales de confianza en Tandil';
    }
    for (const [property, content] of Object.entries(social)) this.meta.updateTag({ property, content });
    this.meta.updateTag({ name: 'twitter:card', content: url ? 'summary_large_image' : 'summary' });
  }

  private setRobots(indexable: boolean): void {
    if (indexable) this.meta.removeTag("name='robots'");
    else this.meta.updateTag({ name: 'robots', content: 'noindex, nofollow' });
  }

  private clearSocial(): void {
    for (const property of ['og:title', 'og:description', 'og:url', 'og:image', 'og:image:width', 'og:image:height', 'og:image:alt'])
      this.meta.removeTag(`property='${property}'`);
  }

  private setCanonical(href: string | null): void {
    const existing = this.doc.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!href) {
      existing?.remove();
      return;
    }
    const link = existing ?? this.doc.createElement('link');
    link.rel = 'canonical';
    link.href = href;
    if (!link.parentNode) this.doc.head.appendChild(link);
  }
}
