import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { ProfessionalDetail } from '../models/professional';
import { PublicLinks } from './public-links';

@Injectable({ providedIn: 'root' })
export class ProfileSeo {
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly doc = inject(DOCUMENT);
  private readonly links = inject(PublicLinks);
  update(p: ProfessionalDetail): void {
    const profession = p.headline || p.services[0]?.name || 'Profesional';
    const title = `${p.displayName} — ${profession}${/tandil/i.test(profession) ? '' : ' en Tandil'} | Resuelve`;
    const description = `${p.displayName}. ${profession}${/tandil/i.test(profession) ? '' : ' en Tandil'}. Conocé su trabajo, opiniones y pedí presupuesto por Resuelve.`;
    this.title.setTitle(title);
    this.meta.updateTag({ name: 'description', content: description });
    for (const [property, content] of Object.entries({
      'og:title': title,
      'og:description': description,
      'og:url': this.links.profile(p),
      'og:type': 'profile',
    }))
      this.meta.updateTag({ property, content });
    if (p.avatarUrl) this.meta.updateTag({ property: 'og:image', content: p.avatarUrl });
    else this.meta.removeTag("property='og:image'");
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
  }
}
