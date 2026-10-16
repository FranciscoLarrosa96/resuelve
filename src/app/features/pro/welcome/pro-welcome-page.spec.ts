import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { vi } from 'vitest';
import { OwnProfessional } from '../../../core/models/pro-profile';
import { ProStore } from '../../../core/state/pro.store';
import { LocalityStore } from '../../../core/state/locality.store';
import { TEST_LOCALITY, useTestLocality } from '../../../core/state/locality.testing';
import { WELCOME_STATE, welcomeGuard } from '../../../core/auth/auth.guard';
import { ProWelcomePage } from './pro-welcome-page';

@Component({ template: 'Inicio del panel' })
class Dashboard {}

const RIO_CUARTO = { ...TEST_LOCALITY, id: 'rio-cuarto', name: 'Río Cuarto', slug: 'rio-cuarto', label: 'Río Cuarto, Córdoba' };

const own = (extra: Partial<OwnProfessional> = {}) =>
  ({
    id: 'profile-1', slug: 'marta-gomez', displayName: 'Marta Gómez', firstName: 'Marta', lastName: 'Gómez', status: 'ACTIVE',
    offeredServices: [
      { id: 's-gas', name: 'Gas', slug: 'gas', requiresLicense: true, licenseStatus: 'NOT_SUBMITTED', public: true },
      { id: 's-pint', name: 'Pintura', slug: 'pintura', requiresLicense: false, licenseStatus: 'NOT_REQUIRED', public: true },
    ],
    coverage: [
      { locality: { id: 'mdp', name: 'Mar del Plata' }, coversEntireCity: true, zones: [] },
      { locality: { id: 'tandil', name: 'Tandil' }, coversEntireCity: false, zones: [{ id: 'z', name: 'Centro' }] },
    ],
    coversEntireCity: true, zones: [],
    contact: { whatsappEnabled: false, callsEnabled: false, requestsEnabled: true, whatsappNumber: null, whatsappDisplay: null, phoneNumber: null, phoneDisplay: null, phoneKind: null, consentAt: null },
    ...extra,
  }) as unknown as OwnProfessional;

async function open(profile: OwnProfessional | null = own(), withState = true) {
  // La ciudad donde busca como cliente (Río Cuarto) no tiene nada que ver con donde trabaja.
  useTestLocality(RIO_CUARTO);
  const ownProfile = signal<OwnProfessional | null>(profile);
  TestBed.configureTestingModule({
    providers: [
      provideRouter([
        { path: 'pro/bienvenida', canActivate: [welcomeGuard], component: ProWelcomePage },
        { path: 'pro/dashboard', component: Dashboard },
        { path: '**', component: Dashboard },
      ]),
      {
        provide: ProStore,
        useValue: {
          ownProfile,
          ownProfileError: signal(false),
          refreshProfile: vi.fn(),
          // Foto de perfil (editor de la bienvenida).
          me: signal(null),
          avatarUpload: signal(null),
          avatarError: signal(null),
          uploadAvatar: vi.fn(),
          removeAvatar: vi.fn(),
        },
      },
    ],
  });
  const harness = await RouterTestingHarness.create();
  const router = TestBed.inject(Router);
  await router.navigateByUrl('/pro/bienvenida', withState ? { state: { [WELCOME_STATE]: true } } : {});
  harness.detectChanges();
  return { el: harness.routeNativeElement as HTMLElement, router, harness, ownProfile };
}

const text = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ');

describe('/pro/bienvenida', () => {
  beforeEach(() => localStorage.clear());

  it('perfil publicado: título positivo, dónde puede aparecer y "Compartir mi perfil" como acción principal', async () => {
    const { el } = await open();
    const page = el.querySelector('[data-testid="pro-welcome"]')!;
    expect(text(page.querySelector('h1'))).toContain('¡Ya tenés tu espacio en Resuelve! 🎉');
    expect(text(page)).toContain('Tu perfil ya está publicado y puede aparecer cuando buscan profesionales en Mar del Plata y Tandil.');
    expect(text(page)).toContain('Ahora podés compartirlo con tus clientes, mostrar tus trabajos');
    const share = page.querySelector('[data-testid="profile-share-button"]')!;
    expect(text(share)).toContain('Compartir mi perfil');
    expect(share.className).toContain('button-primary');
    // Una sola acción rellena: la matrícula y el panel quedan en tono secundario.
    expect(page.querySelectorAll('.button-primary')).toHaveLength(1);
    expect(page.querySelector('[data-testid="profile-share-copy"]')).not.toBeNull();
    expect(text(page)).not.toMatch(/PRO|suscrip|\$/);
  });

  it('compartir usa el enlace público real (Web Share API) y copiar queda como alternativa con aviso', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    try {
      const { el, harness } = await open();
      el.querySelector<HTMLButtonElement>('[data-testid="profile-share-button"]')!.click();
      await harness.fixture.whenStable();
      expect(share).toHaveBeenCalledWith(expect.objectContaining({ url: expect.stringMatching(/\/p\/marta-gomez\?src=share$/) }));
      const copy = el.querySelector<HTMLButtonElement>('[data-testid="profile-share-copy"]')!;
      copy.click();
      await harness.fixture.whenStable();
      harness.detectChanges();
      expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/\/p\/marta-gomez\?src=share$/));
      expect(text(copy)).toContain('Copiado');
    } finally {
      delete (navigator as { share?: unknown }).share;
    }
  });

  it('sin Web Share API, compartir abre el diálogo con el enlace, WhatsApp y copiar', async () => {
    const { el, harness } = await open();
    expect('share' in navigator).toBe(false);
    el.querySelector<HTMLButtonElement>('[data-testid="profile-share-button"]')!.click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    const dialog = document.querySelector('[aria-labelledby="profile-share-dialog-title"]') ?? el;
    expect(dialog.querySelector<HTMLInputElement>('#share-link')?.value).toMatch(/\/p\/marta-gomez\?src=share$/);
    expect(text(dialog)).toContain('Copiar enlace');
  });

  it('puede seguir directo al panel y ver su perfil público', async () => {
    const { el } = await open();
    const actions = el.querySelector('[data-testid="welcome-actions"]')!;
    expect(actions.querySelector('a[href="/pro/dashboard"]')).not.toBeNull();
    expect(actions.querySelector('a[href="/p/marta-gomez"]')).not.toBeNull();
  });

  it('matrícula: opcional y secundaria, nunca un paso obligatorio', async () => {
    const { el } = await open();
    const license = el.querySelector('[data-testid="welcome-license"]')!;
    expect(text(license)).toContain('Matrícula (opcional).');
    expect(text(license)).toContain('En Gas ya aparecés sin enviarla.');
    expect(license.querySelector('a')!.getAttribute('href')).toBe('/pro/perfil?editar=licenses');
    expect(license.querySelector('a')!.className).toContain('button-secondary');
    TestBed.resetTestingModule();
    const sent = await open(own({ offeredServices: [{ id: 's-gas', name: 'Gas', slug: 'gas', requiresLicense: true, licenseStatus: 'PENDING', public: true }] }));
    expect(sent.el.querySelector('[data-testid="welcome-license"]')).toBeNull();
  });

  it('sin WhatsApp ni llamadas: dice que recibe solicitudes y cómo sumarlos después', async () => {
    const { el } = await open();
    const contact = el.querySelector('[data-testid="welcome-contact"]')!;
    expect(text(contact)).toContain('Los clientes pueden enviarte solicitudes por Resuelve.');
    expect(contact.querySelector('a')!.getAttribute('href')).toBe('/pro/perfil?editar=contact');
  });

  it('con canales directos: lo que eligió, sin sugerir configurarlos', async () => {
    const both = own({ contact: { ...own().contact!, whatsappEnabled: true, callsEnabled: true } });
    const { el } = await open(both);
    expect(text(el.querySelector('[data-testid="welcome-contact"]'))).toContain(
      'Los clientes pueden escribirte por WhatsApp o llamarte desde tu perfil, o enviarte una solicitud por Resuelve.',
    );
    TestBed.resetTestingModule();
    const calls = await open(own({ contact: { ...own().contact!, callsEnabled: true, requestsEnabled: false } }));
    const contact = calls.el.querySelector('[data-testid="welcome-contact"]')!;
    expect(text(contact)).toContain('Los clientes pueden llamarte desde tu perfil.');
    expect(contact.querySelector('a')).toBeNull();
  });

  it('si el perfil no puede aparecer en búsquedas, no dice "publicado" ni ofrece compartirlo', async () => {
    const { el } = await open(own({ coverage: [], coversEntireCity: false }));
    expect(text(el.querySelector('h1'))).toBe(' Tu perfil profesional está creado ');
    expect(text(el)).not.toContain('publicado');
    expect(text(el.querySelector('[data-testid="welcome-gaps"]'))).toContain('te falta dónde trabajás');
    expect(el.querySelector('[data-testid="profile-share-button"]')).toBeNull();
    // El panel pasa a ser la acción principal.
    expect(el.querySelector('[data-testid="welcome-actions"] a[href="/pro/dashboard"]')!.className).toContain('button-primary');
  });

  it('no cambia la ciudad donde busca como cliente ni la cobertura profesional', async () => {
    const profile = own();
    const { ownProfile } = await open(profile);
    expect(TestBed.inject(LocalityStore).current()?.name).toBe('Río Cuarto');
    expect(ownProfile()!.coverage!.map((c) => c.locality.name)).toEqual(['Mar del Plata', 'Tandil']);
  });

  it('una sola vez: entrar a mano (sin venir del alta) lleva al Inicio del panel', async () => {
    const { router, el } = await open(own(), false);
    expect(router.url).toBe('/pro/dashboard');
    expect(el.textContent).toContain('Inicio del panel');
  });

  it('sin foto: antes de compartir, sugiere sumar la foto (opcional); con foto, no la pide', async () => {
    const { el } = await open();
    expect(el.querySelector('[data-testid="welcome-avatar"]')?.textContent).toContain('Antes de compartir, sumá tu foto');
    TestBed.resetTestingModule();
    const withPhoto = await open(own({ avatarUrl: 'https://res.cloudinary.test/a.jpg' } as Partial<OwnProfessional>));
    expect(withPhoto.el.querySelector('[data-testid="welcome-avatar"]')).toBeNull();
  });
});

describe('/pro/bienvenida con un oficio sugerido en revisión', () => {
  const pendingProfile = () =>
    own({
      offeredServices: [],
      publication: { published: false, blockers: ['NO_SERVICE'], pendingSuggestions: [{ id: 's1', name: 'Armado de pérgolas' }] },
    });

  it('dice que el perfil está creado pero no publicado, sin ofrecer compartirlo ni ver la ficha pública', async () => {
    const { el } = await open(pendingProfile());
    const pending = el.querySelector('[data-testid=welcome-pending]');
    expect(text(pending)).toContain('no está publicado');
    expect(text(pending)).toContain('“Armado de pérgolas”');
    expect(text(el)).toContain('Te avisamos dentro de la app');
    expect(text(el)).not.toContain('Perfil publicado');
    expect(text(el)).not.toContain('Compartir mi perfil');
    expect(text(el)).not.toContain('Ver mi perfil público');
    expect(el.querySelector('[data-testid=welcome-gaps]')).toBeNull();
    expect(text(el.querySelector('[data-testid=welcome-actions]'))).toContain('Ir al panel profesional');
  });

  it('si falta otra cosa (sin sugerencias en revisión), mantiene el aviso de lo que falta', async () => {
    const { el } = await open(
      own({ offeredServices: [], publication: { published: false, blockers: ['NO_SERVICE'], pendingSuggestions: [] } }),
    );
    expect(el.querySelector('[data-testid=welcome-pending]')).toBeNull();
    expect(text(el.querySelector('[data-testid=welcome-gaps]'))).toContain('un servicio habilitado');
  });
});
