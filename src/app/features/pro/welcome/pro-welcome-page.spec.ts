import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { vi } from 'vitest';
import { OwnProfessional } from '../../../core/models/pro-profile';
import { ProStore } from '../../../core/state/pro.store';
import { LocalityStore } from '../../../core/state/locality.store';
import { TEST_LOCALITY, useTestLocality } from '../../../core/state/locality.testing';
import { welcomeGuard } from '../../../core/auth/auth.guard';
import { WelcomeTicket } from '../../../core/auth/welcome-ticket';
import { AuthStore } from '../../../core/state/auth.store';
import { WorkPhotosStore } from '../../../core/state/work-photos.store';
import { ActivationSession } from '../activation-session';
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

async function open(profile: OwnProfessional | null = own(), granted = true, photos = 0) {
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
      { provide: AuthStore, useValue: { user: signal({ id: 'user-1' }) } },
      { provide: WorkPhotosStore, useValue: { load: async () => undefined, loadError: signal(false), storedCount: signal(photos) } },
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
  if (granted) TestBed.inject(WelcomeTicket).grant();
  await router.navigateByUrl('/pro/bienvenida');
  await harness.fixture.whenStable();
  harness.detectChanges();
  return { el: harness.routeNativeElement as HTMLElement, router, harness, ownProfile };
}

const WITH_PHOTO = { avatarUrl: 'https://res.cloudinary.test/a.jpg' } as Partial<OwnProfessional>;
const DIRECT = () => ({ contact: { ...own().contact!, whatsappEnabled: true } });
/** Perfil presentable: foto, trabajos (photos > 0 al abrir), contacto directo y reseña. */
const READY = () => own({ ...WITH_PHOTO, ...DIRECT(), reviewsCount: 2 } as Partial<OwnProfessional>);

const text = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ');

describe('/pro/bienvenida', () => {
  beforeEach(() => localStorage.clear());

  beforeEach(() => sessionStorage.clear());

  it('perfil publicado: confirmación breve, dónde puede aparecer y un solo próximo paso', async () => {
    const { el } = await open();
    const page = el.querySelector('[data-testid="pro-welcome"]')!;
    expect(text(page.querySelector('h1'))).toContain('¡Ya tenés tu espacio en Resuelve! 🎉');
    expect(text(page)).toContain('Tu perfil ya está publicado y puede aparecer cuando buscan profesionales en Mar del Plata y Tandil.');
    expect(page.querySelectorAll('[data-testid="welcome-next"] [data-tip]')).toHaveLength(1);
    // La foto sigue siendo el próximo paso; la vista previa permite revisar y compartir sin bloquearlo.
    expect(page.querySelector('[data-testid="welcome-next"] [data-tip]')!.getAttribute('data-tip')).toBe('AVATAR');
    expect(page.querySelectorAll('[data-testid="profile-share-button"]')).toHaveLength(1);
    expect(page.querySelector('[data-testid="welcome-preview"]')?.textContent).toContain('Marta Gómez');
    expect(page.querySelector('[data-testid="welcome-preview"] a')?.getAttribute('href')).toBe('/p/marta-gomez');
    // Una sola acción rellena: ir al panel.
    expect(page.querySelectorAll('.button-primary')).toHaveLength(1);
    expect(text(page)).not.toMatch(/PRO|suscrip|\$/);
  });

  it('la secuencia es la de activationTips: foto → trabajos → contacto → reseña → compartir al final', async () => {
    const order: [Partial<OwnProfessional>, number, string][] = [
      [{}, 0, 'AVATAR'],
      [WITH_PHOTO, 0, 'PHOTOS'],
      [WITH_PHOTO, 2, 'CONTACT'],
      [{ ...WITH_PHOTO, ...DIRECT() }, 2, 'REVIEW'],
      [{ ...WITH_PHOTO, ...DIRECT(), reviewsCount: 1 } as Partial<OwnProfessional>, 2, 'SHARE'],
    ];
    for (const [extra, photos, expected] of order) {
      sessionStorage.clear();
      TestBed.resetTestingModule();
      const { el } = await open(own(extra), true, photos);
      expect(el.querySelector('[data-testid="welcome-next"] [data-tip]')!.getAttribute('data-tip')).toBe(expected);
    }
  });

  it('lo que ya se salteó en esta sesión ("Configurar más tarde") no se vuelve a proponer; su configuración sigue a mano', async () => {
    sessionStorage.setItem('resuelve:activation-session', JSON.stringify({ userId: 'user-1', tips: ['CONTACT'] }));
    const { el } = await open(own(WITH_PHOTO), true, 2);
    expect(el.querySelector('[data-testid="welcome-next"] [data-tip]')!.getAttribute('data-tip')).toBe('REVIEW');
    expect(el.querySelector('[data-tip="CONTACT"]')).toBeNull();
    // La configuración sigue disponible, sin repetir la tarjeta.
    expect(el.querySelector('[data-testid="welcome-contact"] a')!.getAttribute('href')).toBe('/pro/perfil?editar=contact');
  });

  it('mostrar el paso lo deja como visto en la sesión (el Inicio no lo repite enseguida) sin marcarlo como hecho', async () => {
    const session = () => TestBed.inject(ActivationSession).skipped('user-1');
    const { el } = await open();
    expect(el.querySelector('[data-tip="AVATAR"]')).not.toBeNull();
    expect(session()).toEqual(['AVATAR']);
  });

  it('al subir la foto confirma en el lugar y no salta a otro paso', async () => {
    const { el, harness, ownProfile } = await open();
    ownProfile.set(own(WITH_PHOTO));
    harness.detectChanges();
    expect(text(el.querySelector('[data-testid="welcome-next"]'))).toContain('¡Listo, ya se ve tu foto!');
    expect(el.querySelectorAll('[data-testid="welcome-next"] [data-tip]')).toHaveLength(1);
    expect(el.querySelector('[data-tip="AVATAR"]')).not.toBeNull();
  });

  it('compartir usa el enlace público real (Web Share API) y copiar queda como alternativa con aviso', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    try {
      const { el, harness } = await open(READY(), true, 2);
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
    const { el, harness } = await open(READY(), true, 2);
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
    expect(TestBed.inject(ActivationSession).skipped('user-1')).toEqual([]);
    expect(router.url).toBe('/pro/dashboard');
    expect(el.textContent).toContain('Inicio del panel');
  });

  it('compartir es el último paso: solo con el perfil presentable, y entonces es la acción principal', async () => {
    const { el } = await open(READY(), true, 2);
    const share = el.querySelector('[data-testid="profile-share-button"]')!;
    expect(share.className).toContain('button-primary');
    // El panel pasa a secundario: una sola acción rellena.
    expect(el.querySelectorAll('.button-primary')).toHaveLength(1);
    expect(el.querySelector('[data-testid="welcome-actions"] a[href="/pro/dashboard"]')!.className).toContain('button-secondary');
    expect(el.querySelector('[data-testid="profile-share-copy"]')).not.toBeNull();
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
    // Sin publicar no hay próximo paso de difusión (ni foto, ni reseñas, ni compartir).
    expect(el.querySelector('[data-testid=welcome-next]')).toBeNull();
    expect(text(el)).toContain('se publica cuando el perfil cumple las demás condiciones');
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
