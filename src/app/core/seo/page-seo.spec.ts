import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Meta } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';
import { ProfileSeo, isIndexableProfile } from '../acquisition/profile-seo';
import { ProfessionalDetail } from '../models/professional';
import { PageSeo } from './page-seo';

@Component({ template: '' })
class Blank {}

const head = (selector: string) => document.head.querySelector<HTMLElement>(selector);

describe('SEO por ruta', () => {
  let router: Router;
  let meta: Meta;

  beforeEach(() => {
    document.head.querySelectorAll('link[rel="canonical"], meta[name="robots"], meta[property^="og:"], meta[name^="twitter:"], #seo-breadcrumbs').forEach((e) => e.remove());
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'publica', title: 'Pública · Resuelve', component: Blank, data: { seo: { description: 'Descripción pública' } } },
          { path: 'legal', title: 'Legal · Resuelve', component: Blank, data: { seo: {} } },
          { path: 'privada', title: 'Privada · Resuelve', component: Blank },
          { path: 'p/:slug', component: Blank, data: { seo: 'profile' } },
        ]),
      ],
    });
    TestBed.inject(PageSeo);
    router = TestBed.inject(Router);
    meta = TestBed.inject(Meta);
  });

  it('una página pública es indexable: descripción, canonical sin query y Open Graph con su título', async () => {
    await router.navigateByUrl('/publica?utm=x#a');
    expect(meta.getTag('name="description"')?.content).toBe('Descripción pública');
    expect(meta.getTag('name="robots"')).toBeNull();
    expect((head('link[rel="canonical"]') as HTMLLinkElement).href).toBe(`${location.origin}/publica`);
    expect(meta.getTag('property="og:title"')?.content).toBe('Pública · Resuelve');
    expect(meta.getTag('property="og:url"')?.content).toBe(`${location.origin}/publica`);
    expect(meta.getTag('property="og:locale"')?.content).toBe('es_AR');
    expect(meta.getTag('property="og:image"')?.content).toBe(`${location.origin}/og-image.png`);
    expect(meta.getTag('property="og:image:width"')?.content).toBe('1200');
    expect(meta.getTag('name="twitter:card"')?.content).toBe('summary_large_image');
  });

  it('una página pública publica Twitter Card completa y migas de pan; el inicio no lleva migas', async () => {
    await router.navigateByUrl('/publica');
    expect(meta.getTag('name="twitter:title"')?.content).toBe('Pública · Resuelve');
    expect(meta.getTag('name="twitter:description"')?.content).toBe('Descripción pública');
    expect(meta.getTag('name="twitter:image"')?.content).toBe(`${location.origin}/og-image.png`);
    const crumbs = JSON.parse(document.getElementById('seo-breadcrumbs')!.textContent!);
    expect(crumbs.itemListElement.map((i: { name: string }) => i.name)).toEqual(['Resuelve', 'Pública']);
    expect(crumbs.itemListElement[1].item).toBe(`${location.origin}/publica`);
    await router.navigateByUrl('/privada');
    expect(document.getElementById('seo-breadcrumbs')).toBeNull();
    expect(meta.getTag('name="twitter:title"')).toBeNull();
  });

  it('una ruta sin `seo` sale con noindex y sin canonical (nunca se indexa por olvido)', async () => {
    await router.navigateByUrl('/publica');
    await router.navigateByUrl('/privada');
    expect(meta.getTag('name="robots"')?.content).toBe('noindex, nofollow');
    expect(head('link[rel="canonical"]')).toBeNull();
    expect(meta.getTag('property="og:url"')).toBeNull();
  });

  it('al volver a una pública se quita el noindex', async () => {
    await router.navigateByUrl('/privada');
    await router.navigateByUrl('/publica');
    expect(meta.getTag('name="robots"')).toBeNull();
  });

  it('`seo: {}` es indexable pero respeta la descripción que puso la propia página', async () => {
    meta.updateTag({ name: 'description', content: 'La de la página' });
    await router.navigateByUrl('/legal');
    expect(meta.getTag('name="description"')?.content).toBe('La de la página');
    expect(meta.getTag('property="og:description"')?.content).toBe('La de la página');
    expect(meta.getTag('name="robots"')).toBeNull();
  });

  it('el perfil público lo maneja ProfileSeo: PageSeo no lo toca', async () => {
    meta.updateTag({ name: 'robots', content: 'noindex, follow' });
    await router.navigateByUrl('/p/ana-gomez');
    expect(meta.getTag('name="robots"')?.content).toBe('noindex, follow');
  });
});

describe('SEO del perfil público', () => {
  const base = {
    id: 'id-1',
    slug: 'ana-gomez',
    displayName: 'Ana Gómez',
    headline: 'Plomera',
    avatarUrl: null,
    acceptingRequests: true,
    services: [{ id: 's', name: 'Plomería', slug: 'plomeria' }],
  } as unknown as ProfessionalDetail;

  beforeEach(() => {
    document.head.querySelectorAll('link[rel="canonical"], meta[name="robots"], meta[property^="og:"]').forEach((e) => e.remove());
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  it('activo y con servicio: indexable, canonical al slug (sin ?src) y sin contacto', () => {
    const seo = TestBed.inject(ProfileSeo);
    seo.update(base);
    const meta = TestBed.inject(Meta);
    expect(meta.getTag('name="robots"')).toBeNull();
    expect((head('link[rel="canonical"]') as HTMLLinkElement).href).toBe(`${location.origin}/p/ana-gomez`);
    expect(meta.getTag('property="og:site_name"')?.content).toBe('Resuelve');
    // Sin foto de perfil: imagen de marca, nunca un preview vacío.
    expect(meta.getTag('property="og:image"')?.content).toBe(`${location.origin}/og-image.png`);
    expect(document.head.innerHTML).not.toMatch(/@|tel:|\+54/);
  });

  it('pausado o sin servicio publicable: noindex (el enlace sigue abriendo); clear() lo limpia', () => {
    const seo = TestBed.inject(ProfileSeo);
    const meta = TestBed.inject(Meta);
    expect(isIndexableProfile({ ...base, acceptingRequests: false })).toBe(false);
    expect(isIndexableProfile({ ...base, services: [] })).toBe(false);
    seo.update({ ...base, acceptingRequests: false });
    expect(meta.getTag('name="robots"')?.content).toBe('noindex, follow');
    seo.clear();
    expect(meta.getTag('name="robots"')).toBeNull();
    expect(head('link[rel="canonical"]')).toBeNull();
  });
});
