import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { ProfessionalDetail } from '../models/professional';
import { SHARE_IMAGE } from '../seo/page-seo';
import { PublicLinks } from './public-links';

/** Mismas reglas que el sitemap del backend: activo y con al menos un servicio publicable. */
export const isIndexableProfile = (p: Pick<ProfessionalDetail, 'acceptingRequests' | 'services'>): boolean =>
  p.acceptingRequests !== false && p.services.length > 0;

@Injectable({ providedIn: 'root' })
export class ProfileSeo {
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly doc = inject(DOCUMENT);
  private readonly links = inject(PublicLinks);
  update(p: ProfessionalDetail): void {
    const profession = p.headline || p.services[0]?.name || 'Profesional';
    // Ciudad principal real del perfil (nunca una asumida); sin repetirla si ya está en el título profesional.
    const city = p.primaryLocality?.name;
    const where = city && !profession.toLowerCase().includes(city.toLowerCase()) ? ` en ${city}` : '';
    const title = `${p.displayName} — ${profession}${where} | Resuelve`;
    const description = `${p.displayName}. ${profession}${where}. Conocé su trabajo, opiniones y pedí presupuesto por Resuelve.`;
    this.title.setTitle(title);
    this.meta.updateTag({ name: 'description', content: description });
    // Perfil pausado o sin servicio publicable: el enlace sigue abriendo, pero no se indexa.
    if (isIndexableProfile(p)) this.meta.removeTag("name='robots'");
    else this.meta.updateTag({ name: 'robots', content: 'noindex, follow' });
    for (const [property, content] of Object.entries({
      'og:title': title,
      'og:description': description,
      'og:url': this.links.profile(p),
      'og:type': 'profile',
      'og:site_name': 'Resuelve',
      'og:locale': 'es_AR',
    }))
      this.meta.updateTag({ property, content });
    // Sin foto de perfil, la imagen de marca (nunca un preview vacío).
    const image = p.avatarUrl || (this.links.origin ? this.links.origin + SHARE_IMAGE : '');
    if (image) this.meta.updateTag({ property: 'og:image', content: image });
    else this.meta.removeTag("property='og:image'");
    this.meta.updateTag({ name: 'twitter:card', content: image && !p.avatarUrl ? 'summary_large_image' : 'summary' });
    const link =
      this.doc.querySelector<HTMLLinkElement>('link[rel="canonical"]') ||
      this.doc.createElement('link');
    link.rel = 'canonical';
    link.href = this.links.profile(p);
    if (!link.parentNode) this.doc.head.appendChild(link);
  }
  clear(): void {
    this.title.setTitle('Resuelve');
    this.doc.querySelector('link[rel="canonical"]')?.remove();
    for (const property of ['og:title', 'og:description', 'og:url', 'og:type', 'og:image'])
      this.meta.removeTag(`property='${property}'`);
    this.meta.removeTag("name='description'");
    this.meta.removeTag("name='robots'");
  }
}
