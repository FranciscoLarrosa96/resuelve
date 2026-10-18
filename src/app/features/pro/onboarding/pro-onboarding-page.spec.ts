import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ServiceSuggestions } from '../../../shared/components/service-suggestions/service-suggestions';
import { HttpErrorResponse } from '@angular/common/http';
import { Router, provideRouter } from '@angular/router';
import { Observable, Subject, of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { ServiceSuggestion, ServiceSuggestionsApi } from '../../../core/api/service-suggestions-api.service';
import { CatalogApiService } from '../../../core/api/catalog-api.service';
import { CreateProfessionalProfile, OwnProfessional, ProProfileApiService } from '../../../core/api/pro-profile-api.service';
import { AuthUser } from '../../../core/models/auth';
import { AuthStore } from '../../../core/state/auth.store';
import { ProStore } from '../../../core/state/pro.store';
import { ContactSettingsInput } from '../../../core/models/pro-profile';
import { LocalitiesApiService } from '../../../core/api/localities-api.service';
import { TEST_LOCALITY, useTestLocality } from '../../../core/state/locality.testing';
import { LocalityStore } from '../../../core/state/locality.store';
import { WelcomeTicket } from '../../../core/auth/welcome-ticket';
import { ActivationSession } from '../activation-session';
import { draftKey } from './onboarding-draft';
import { ProOnboardingPage } from './pro-onboarding-page';

/** Terminó el alta: la bienvenida se abre en el área profesional, una sola vez (permiso en memoria). */
function expectWelcome(navigate: ReturnType<typeof vi.spyOn>) {
  expect(navigate).toHaveBeenCalledWith('/pro/bienvenida', { replaceUrl: true });
  expect(TestBed.inject(WelcomeTicket).consume()).toBe(true);
}

/** Borrador del alta guardado en este navegador (por cuenta). */
const draftRaw = (id = 'user-1') => localStorage.getItem(draftKey(id));
const draft = (id = 'user-1') => JSON.parse(draftRaw(id)!);

/** Ciudad principal: la que la persona estaba mirando (un toque) y, si se pide, "Solo algunos barrios". */
function chooseCity(host: HTMLElement, fixture: { detectChanges(): void }, mode: 'entire' | 'zones' = 'zones') {
  button(host, `Trabajo en ${TEST_LOCALITY.name}`).click();
  fixture.detectChanges();
  if (mode === 'zones') {
    [...host.querySelectorAll('label')].find((l) => l.textContent?.trim() === 'Solo algunos barrios')!.querySelector('input')!.click();
    fixture.detectChanges();
  }
}

/** Elige un barrio con el autocompletado: enfoca el buscador y toca la opción. */
function pickZone(host: HTMLElement, fixture: { detectChanges(): void }, name: string) {
  if (!host.querySelector('input[role=combobox]')) chooseCity(host, fixture);
  host.querySelector<HTMLInputElement>('input[role=combobox]')!.dispatchEvent(new Event('focus'));
  fixture.detectChanges();
  [...host.querySelectorAll<HTMLElement>('[role=option]')].find((o) => o.textContent?.trim() === name)!.click();
  fixture.detectChanges();
}

@Component({ template: '' })
class Blank {}

const USER: AuthUser = {
  id: 'user-1', firstName: 'María', lastName: 'Pérez', email: 'maria@example.com', phone: '+54 249 555-1111',
  phoneVerified: false,
  emailVerifiedAt: '2026-01-01T00:00:00.000Z',
  emailVerified: true, avatarUrl: null, defaultZoneId: null, professionalProfileId: null,
  createdAt: '2026-09-01T12:00:00.000Z',
};
const SERVICE_ID = '11111111-1111-4111-8111-111111111111';
const ZONE_ID = '22222222-2222-4222-8222-222222222222';
const PROFILE_ID = '33333333-3333-4333-8333-333333333333';

type SaveContactResult = { message: string; field: string | null } | null;

let currentUser: AuthUser = USER;

function setup(
  response: Observable<OwnProfessional> = of({ id: PROFILE_ID } as OwnProfessional),
  saveContact: (input: ContactSettingsInput) => Promise<SaveContactResult> = async () => null,
  suggestions: ServiceSuggestion[] = [],
) {
  useTestLocality();
  const user = signal<AuthUser | null>(currentUser);
  const auth = { user, displayName: signal('María Pérez'), loadMe: vi.fn(async () => {
    user.set({ ...USER, professionalProfileId: PROFILE_ID });
    return user();
  }) };
  const profileApi = { startOnboarding: vi.fn(() => of({ professionalIntentAt: null })), createProfile: vi.fn(() => response) };
  // Los canales se guardan con la misma acción de Mi perfil (ProStore.saveContact → PATCH /pro/contact).
  const proStore = { savingContact: signal(false), ownProfile: signal(null), saveContact: vi.fn(saveContact) };
  TestBed.configureTestingModule({ providers: [
    provideRouter([
      { path: 'verificar-email', component: Blank }, { path: 'pro/dashboard', component: Blank }, { path: 'pro/bienvenida', component: Blank },
      { path: 'profesional/:id', component: Blank },
    ]),
    { provide: AuthStore, useValue: auth },
    { provide: CatalogApiService, useValue: {
      getCategories: () => of([{ id: 'category-1', name: 'Oficios', slug: 'oficios', services: [
        { id: SERVICE_ID, name: 'Gas', slug: 'gas', categoryId: 'category-1', requiresLicense: true },
      ] }]),
    } },
    { provide: LocalitiesApiService, useValue: {
      neighborhoods: () => of([{ id: ZONE_ID, name: 'Centro', slug: 'centro', cityId: TEST_LOCALITY.id }]),
      search: () => of([]),
    } },
    { provide: ProProfileApiService, useValue: profileApi },
    { provide: ProStore, useValue: proStore },
    { provide: ServiceSuggestionsApi, useValue: { mine: () => of(suggestions) } },
  ] });
  const fixture = TestBed.createComponent(ProOnboardingPage);
  fixture.detectChanges();
  return { fixture, profileApi, auth, proStore };
}

function button(host: HTMLElement, label: string): HTMLButtonElement {
  const found = [...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === label);
  if (!found) throw new Error(`No se encontró el botón ${label}`);
  return found;
}

beforeEach(() => { sessionStorage.clear(); localStorage.clear(); currentUser = USER; });

describe('alta profesional', () => {
  it('recarga el catálogo al elegir una sugerencia aprobada y la conserva en el borrador', async () => {
    const { fixture } = setup();
    await fixture.whenStable(); fixture.detectChanges();
    const id = '44444444-4444-4444-8444-444444444444';
    vi.spyOn(TestBed.inject(CatalogApiService), 'getCategories').mockReturnValue(of([
      { id: 'exterior', name: 'Exterior', slug: 'exterior', services: [{ id, name: 'Corte de pasto', slug: 'corte-de-pasto', categoryId: 'exterior', requiresLicense: false }] },
    ]));
    fixture.debugElement.query(By.directive(ServiceSuggestions)).componentInstance.selected.emit(id);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector<HTMLInputElement>('input[type=checkbox]')?.checked).toBe(true);
    expect(host.textContent).toContain('1 servicio elegido: Corte de pasto');
    expect(draft().serviceIds).toEqual([id]);
    button(host, 'Continuar').click(); fixture.detectChanges();
    expect(host.querySelector('#onboarding-title')?.textContent).toContain('Dónde trabajás');
  });

  it('arranca en "Tus servicios" (sin pantalla de presentación) y "Atrás" en el paso 1 vuelve a /trabaja-con-resuelve', async () => {
    const { fixture } = setup();
    await fixture.whenStable();
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('#onboarding-title')!.textContent).toContain('Tus servicios');
    expect(host.textContent).toContain('Paso 1 de 4');
    expect(host.textContent).not.toContain('Armá tu perfil profesional');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    button(host, 'Atrás').click();
    expect(navigate).toHaveBeenCalledWith('/trabaja-con-resuelve');
  });

  it('usa catálogo real, revisa y publica con una sola llamada; refresca /auth/me', async () => {
    const { fixture, profileApi, auth } = setup();
    await fixture.whenStable();
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    // El alta arranca directo en el paso 1 (la presentación está en /trabaja-con-resuelve).
    fixture.detectChanges();
    expect(host.textContent).toContain('Gas');
    expect(host.textContent).toContain('Matrícula');
    (host.querySelector('input[type=checkbox]') as HTMLInputElement).click();
    fixture.detectChanges();
    button(host, '¿Querés detallar una especialidad de tu rubro?').click();
    fixture.detectChanges();
    const specialty = host.querySelector<HTMLInputElement>('app-service-specialties input')!;
    specialty.value = 'Reparación de calderas';
    specialty.dispatchEvent(new Event('input'));
    button(host, 'Agregar especialidad').click();
    fixture.detectChanges();
    expect(draft().specialties)
      .toEqual([{ serviceId: SERVICE_ID, names: ['Reparación de calderas'] }]);
    button(host, 'Continuar').click();
    fixture.detectChanges();
    pickZone(host, fixture, 'Centro');
    expect(host.querySelector('[aria-label="Quitar Centro"]')).not.toBeNull();
    button(host, 'Continuar').click();
    fixture.detectChanges();
    const headline = host.querySelector<HTMLInputElement>('#pro-headline')!;
    headline.value = 'Gasista en Tandil';
    headline.dispatchEvent(new Event('input'));
    button(host, 'Continuar').click();
    fixture.detectChanges();
    expect(host.textContent).toContain('Gasista en Tandil');
    button(host, 'Publicar perfil').click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(profileApi.createProfile).toHaveBeenCalledOnce();
    expect(profileApi.createProfile).toHaveBeenCalledWith({
      headline: 'Gasista en Tandil', bio: undefined,
      serviceIds: [SERVICE_ID],
      specialties: [{ serviceId: SERVICE_ID, names: ['Reparación de calderas'] }],
      primaryLocalityId: TEST_LOCALITY.id,
      coverage: [{ localityId: TEST_LOCALITY.id, coversEntireCity: false, zoneIds: [ZONE_ID] }],
    } satisfies CreateProfessionalProfile);
    expect(auth.loadMe).toHaveBeenCalledOnce();
    expect(host.textContent).toContain('¿Cómo querés recibir clientes?');
    expect(draftRaw()).toBeNull();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');
    button(host, 'Configurar más tarde').click();
    await fixture.whenStable();
    expectWelcome(navigate);
    expect(draftRaw()).toBeNull();
  });

  it('nunca toca la ciudad donde busca como cliente: la cobertura es aparte', async () => {
    const { fixture } = setup();
    const locality = TestBed.inject(LocalityStore);
    const before = locality.current();
    const choose = vi.spyOn(locality, 'choose');
    const host = await publishMinimal(fixture);
    button(host, 'Configurar más tarde').click();
    await fixture.whenStable();
    expect(choose).not.toHaveBeenCalled();
    expect(locality.current()).toEqual(before);
  });

  it('si no se pudo actualizar la sesión, lo dice y reintenta antes de abrir la bienvenida', async () => {
    const { fixture, auth } = setup();
    auth.loadMe.mockRejectedValueOnce(new Error('red'));
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');
    const host = await publishMinimal(fixture);
    button(host, 'Configurar más tarde').click();
    await fixture.whenStable(); fixture.detectChanges();
    expect(host.querySelector('[role="alert"]')!.textContent).toContain('No pudimos actualizar tu sesión');
    expect(navigate).not.toHaveBeenCalledWith('/pro/bienvenida', expect.anything());
    button(host, 'Actualizar sesión').click();
    await fixture.whenStable();
    expectWelcome(navigate);
  });

  it('"Todo Tandil": no obliga a marcar barrios ni manda una zona falsa; nunca asume una ciudad', async () => {
    const { fixture, profileApi } = setup();
    await fixture.whenStable();
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    // El alta arranca directo en el paso 1 (la presentación está en /trabaja-con-resuelve).
    fixture.detectChanges();
    (host.querySelector('input[type=checkbox]') as HTMLInputElement).click();
    button(host, 'Continuar').click();
    fixture.detectChanges();
    expect(host.textContent).toContain('¿Dónde trabajás?');
    // Sin ciudad elegida no se puede seguir.
    button(host, 'Continuar').click();
    fixture.detectChanges();
    expect(host.querySelector('[role=alert]')?.textContent).toContain('Elegí al menos una localidad');
    chooseCity(host, fixture, 'entire');
    const radio = (name: string) => [...host.querySelectorAll('label')].find((l) => l.textContent?.trim() === name)!.querySelector('input')!;
    expect(radio('Todo Tandil').checked).toBe(true);
    expect(host.textContent).toContain('Vas a aparecer en búsquedas de cualquier barrio de Tandil.');
    expect(host.textContent).not.toContain('Centro');
    button(host, 'Continuar').click();
    fixture.detectChanges();
    const headline = host.querySelector<HTMLInputElement>('#pro-headline')!;
    headline.value = 'Gasista en Tandil';
    headline.dispatchEvent(new Event('input'));
    button(host, 'Continuar').click();
    fixture.detectChanges();
    expect(host.textContent).toContain('Tandil (toda la ciudad)');
    button(host, 'Publicar perfil').click();
    await fixture.whenStable();
    expect(profileApi.createProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        primaryLocalityId: TEST_LOCALITY.id,
        coverage: [{ localityId: TEST_LOCALITY.id, coversEntireCity: true, zoneIds: [] }],
      }),
    );
    expect((profileApi.createProfile.mock.calls[0] as unknown[])[0]).not.toHaveProperty('zoneIds');
  });

  it('conserva la selección al salir y volver en la misma pestaña', async () => {
    const { fixture } = setup();
    await fixture.whenStable();
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    // El alta arranca directo en el paso 1 (la presentación está en /trabaja-con-resuelve).
    fixture.detectChanges();
    (host.querySelector('input[type=checkbox]') as HTMLInputElement).click();
    fixture.detectChanges();
    expect(draftRaw()).toContain(SERVICE_ID);
    fixture.destroy();

    const again = TestBed.createComponent(ProOnboardingPage);
    again.detectChanges();
    await again.whenStable();
    again.detectChanges();
    const restored = again.nativeElement as HTMLElement;
    expect(restored.textContent).toContain('Paso 1 de 4');
    expect(restored.querySelector<HTMLInputElement>('input[type=checkbox]')?.checked).toBe(true);
  });

  it('en la revisión concuerda el singular y el plural de los años de experiencia', async () => {
    for (const [years, expected] of [[1, '1 año'], [3, '3 años']] as const) {
      sessionStorage.clear(); localStorage.clear();
      TestBed.resetTestingModule();
      const { fixture } = setup();
      await fixture.whenStable(); fixture.detectChanges();
      const host = fixture.nativeElement as HTMLElement;
      fixture.detectChanges();
      (host.querySelector('input[type=checkbox]') as HTMLInputElement).click();
      button(host, 'Continuar').click(); fixture.detectChanges();
      pickZone(host, fixture, 'Centro');
      button(host, 'Continuar').click(); fixture.detectChanges();
      const headline = host.querySelector<HTMLInputElement>('#pro-headline')!;
      headline.value = 'Gasista'; headline.dispatchEvent(new Event('input'));
      const input = host.querySelector<HTMLInputElement>('#pro-years')!;
      input.value = String(years); input.dispatchEvent(new Event('input'));
      button(host, 'Continuar').click(); fixture.detectChanges();
      expect(host.querySelector('[data-testid=onboarding-preview]')!.textContent).toContain(`${expected} de experiencia`);
    }
  });

  it('bloquea el doble envío mientras la publicación está en curso', async () => {
    const pending = new Subject<OwnProfessional>();
    const { fixture, profileApi } = setup(pending.asObservable());
    await fixture.whenStable();
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    (host.querySelector('input[type=checkbox]') as HTMLInputElement).click();
    button(host, 'Continuar').click(); fixture.detectChanges();
    pickZone(host, fixture, 'Centro');
    button(host, 'Continuar').click(); fixture.detectChanges();
    const headline = host.querySelector<HTMLInputElement>('#pro-headline')!;
    headline.value = 'Gasista'; headline.dispatchEvent(new Event('input'));
    button(host, 'Continuar').click(); fixture.detectChanges();
    const publish = button(host, 'Publicar perfil');
    publish.click();
    publish.click();
    fixture.detectChanges();
    expect(publish.disabled).toBe(true);
    expect(profileApi.createProfile).toHaveBeenCalledOnce();
    pending.next({ id: PROFILE_ID } as OwnProfessional); pending.complete();
    await fixture.whenStable();
  });

  it('con una cuenta sin verificar manda a verificar el email y conserva el borrador', async () => {
    const { fixture } = setup(
      throwError(() => new HttpErrorResponse({ status: 403, statusText: 'Forbidden', error: { code: 'EMAIL_NOT_VERIFIED' } })),
    );
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');
    await fixture.whenStable(); fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    (host.querySelector('input[type=checkbox]') as HTMLInputElement).click();
    button(host, 'Continuar').click(); fixture.detectChanges();
    pickZone(host, fixture, 'Centro');
    button(host, 'Continuar').click(); fixture.detectChanges();
    const headline = host.querySelector<HTMLInputElement>('#pro-headline')!;
    headline.value = 'Gasista'; headline.dispatchEvent(new Event('input'));
    button(host, 'Continuar').click(); fixture.detectChanges();
    button(host, 'Publicar perfil').click();
    await fixture.whenStable(); fixture.detectChanges();
    expect(navigate).toHaveBeenCalledWith(['/verificar-email'], { queryParams: { returnUrl: '/soy-profesional' } });
    expect(draftRaw()).toContain('Gasista');
  });

  it('ante un error de red conserva el borrador para reintentar', async () => {
    const { fixture } = setup(throwError(() => new HttpErrorResponse({ status: 0, statusText: 'Network' })));
    await fixture.whenStable(); fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    (host.querySelector('input[type=checkbox]') as HTMLInputElement).click();
    button(host, 'Continuar').click(); fixture.detectChanges();
    pickZone(host, fixture, 'Centro');
    button(host, 'Continuar').click(); fixture.detectChanges();
    const headline = host.querySelector<HTMLInputElement>('#pro-headline')!;
    headline.value = 'Gasista'; headline.dispatchEvent(new Event('input'));
    button(host, 'Continuar').click(); fixture.detectChanges();
    button(host, 'Publicar perfil').click();
    await fixture.whenStable(); fixture.detectChanges();
    expect(host.querySelector('[role=alert]')?.textContent).toContain('Tus datos siguen guardados');
    expect(draftRaw()).toContain('Gasista');
  });
});

/** Publica un perfil mínimo y deja la pantalla en "¿Cómo querés recibir clientes?". */
async function publishMinimal(fixture: ReturnType<typeof setup>['fixture']): Promise<HTMLElement> {
  await fixture.whenStable(); fixture.detectChanges();
  const host = fixture.nativeElement as HTMLElement;
  fixture.detectChanges();
  (host.querySelector('input[type=checkbox]') as HTMLInputElement).click();
  button(host, 'Continuar').click(); fixture.detectChanges();
  pickZone(host, fixture, 'Centro');
  button(host, 'Continuar').click(); fixture.detectChanges();
  const headline = host.querySelector<HTMLInputElement>('#pro-headline')!;
  headline.value = 'Electricista'; headline.dispatchEvent(new Event('input'));
  button(host, 'Continuar').click(); fixture.detectChanges();
  button(host, 'Publicar perfil').click();
  await fixture.whenStable(); fixture.detectChanges();
  return host;
}

const toggle = (host: HTMLElement, testId: string) => host.querySelector<HTMLInputElement>(`[data-testid="${testId}"]`)!;
function type(host: HTMLElement, id: string, value: string) {
  const input = host.querySelector<HTMLInputElement>(`#${id}`)!;
  input.value = value;
  input.dispatchEvent(new Event('input'));
}

const PENDING: ServiceSuggestion = {
  id: 'sug-1', name: 'Armado de pérgolas', status: 'PENDING', reason: null,
  createdAt: '2026-10-16T12:00:00.000Z', reviewedAt: null, serviceId: null, serviceName: null, serviceActive: false,
};

describe('alta profesional con un oficio sugerido', () => {
  it('sin ningún servicio ni sugerencia no deja continuar y pide elegir o sugerir', async () => {
    const { fixture } = setup();
    await fixture.whenStable(); fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    button(host, 'Continuar').click();
    fixture.detectChanges();
    expect(host.textContent).toContain('Elegí al menos un servicio, o sugerí tu oficio, para continuar.');
    expect(host.querySelector('[data-testid=onboarding-pending-offer]')).toBeNull();
  });

  it('la acción junto al oficio sugerido avanza el alta sin elegir un servicio aprobado', async () => {
    const { fixture } = setup();
    await fixture.whenStable(); fixture.detectChanges();
    const suggestions = fixture.debugElement.query(By.directive(ServiceSuggestions)).componentInstance as ServiceSuggestions;
    expect(suggestions.onboarding()).toBe(true);
    suggestions.continueRegistration.emit(['Pedicura']);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Dónde trabajás');
    expect(fixture.nativeElement.textContent).not.toContain('Elegí al menos un servicio, o sugerí tu oficio');
  });

  it('con un oficio en revisión permite terminar el alta sin servicios y aclara que queda pendiente de publicación', async () => {
    const { fixture, profileApi, auth } = setup(of({ id: PROFILE_ID } as OwnProfessional), undefined, [PENDING]);
    await fixture.whenStable(); fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const offer = host.querySelector('[data-testid=onboarding-pending-offer]')!;
    expect(offer.textContent).toContain('Armado de pérgolas');
    expect(offer.textContent).toContain('pendiente de publicación');
    button(host, 'Continuar').click();
    fixture.detectChanges();
    chooseCity(host, fixture, 'entire');
    button(host, 'Continuar').click();
    fixture.detectChanges();
    const headline = host.querySelector<HTMLInputElement>('#pro-headline')!;
    headline.value = 'Armo pérgolas';
    headline.dispatchEvent(new Event('input'));
    button(host, 'Continuar').click();
    fixture.detectChanges();
    expect(host.querySelector('[data-testid=onboarding-review-pending]')!.textContent).toContain('pendiente de publicación');
    expect(host.textContent).toContain('Armado de pérgolas · en revisión');
    expect(host.textContent).not.toContain('Publicar perfil');
    button(host, 'Crear perfil (sin publicar)').click();
    await fixture.whenStable(); fixture.detectChanges();
    expect(profileApi.createProfile).toHaveBeenCalledWith(expect.objectContaining({ serviceIds: [], headline: 'Armo pérgolas' }));
    expect(auth.loadMe).toHaveBeenCalledOnce();
    // Ya creado: no dice "publicado" y sigue con el paso opcional de contacto.
    expect(host.textContent).toContain('creado, pendiente de publicación');
    expect(host.textContent).not.toContain('Tu perfil profesional está publicado');
    expect(host.textContent).toContain('¿Cómo querés recibir clientes?');
  });

  it('si además eligió un servicio, se publica como siempre', async () => {
    const { fixture } = setup(of({ id: PROFILE_ID } as OwnProfessional), undefined, [PENDING]);
    await fixture.whenStable(); fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    (host.querySelector('input[type=checkbox]') as HTMLInputElement).click();
    fixture.detectChanges();
    expect(host.querySelector('[data-testid=onboarding-pending-offer]')).toBeNull();
  });
});

describe('alta profesional: ¿Cómo querés recibir clientes?', () => {
  it('aparece después de publicar, con solo solicitudes marcadas y sin usar el teléfono de la cuenta', async () => {
    const { fixture, profileApi } = setup();
    const host = await publishMinimal(fixture);
    expect(profileApi.createProfile).toHaveBeenCalledOnce();
    // La creación del perfil no lleva canales: el registro no cambió.
    expect((profileApi.createProfile.mock.calls[0] as unknown[])[0]).not.toHaveProperty('whatsappEnabled');
    expect(host.querySelector('[data-testid="onboarding-contact"]')).not.toBeNull();
    expect(host.textContent).toContain('Podés cambiar estas opciones cuando quieras desde tu perfil.');
    expect(host.textContent).toContain('Recibí consultas por WhatsApp');
    expect(host.textContent).toContain('Recibí llamadas de clientes');
    expect(host.textContent).toContain('Recibí solicitudes y presupuestos');
    expect(toggle(host, 'contact-requests-toggle').checked).toBe(true);
    expect(toggle(host, 'contact-whatsapp-toggle').checked).toBe(false);
    expect(toggle(host, 'contact-calls-toggle').checked).toBe(false);
    expect(host.querySelector('[data-testid="contact-consent"]')).toBeNull();

    toggle(host, 'contact-whatsapp-toggle').click(); fixture.detectChanges();
    // El número de la cuenta nunca se copia: el campo arranca vacío y el consentimiento desmarcado.
    expect(host.querySelector<HTMLInputElement>('#ob-whatsapp')!.value).toBe('');
    expect(host.querySelector<HTMLInputElement>('[data-testid="contact-consent"] input')!.checked).toBe(false);
    expect(host.querySelector('[data-testid="contact-consent"] a[href="/privacidad#contacto"]')).not.toBeNull();
  });

  it('"Configurar más tarde" sigue sin guardar nada y deja cómo hacerlo después', async () => {
    const { fixture, proStore } = setup();
    const host = await publishMinimal(fixture);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');
    button(host, 'Configurar más tarde').click();
    await fixture.whenStable();
    expect(proStore.saveContact).not.toHaveBeenCalled();
    // "Cómo hacerlo después" lo dice la bienvenida (ver pro-welcome-page.spec).
    expectWelcome(navigate);
    expect(draftRaw()).toBeNull();
  });

  it('WhatsApp y llamadas con el mismo número: pide el consentimiento y guarda con la acción de Mi perfil', async () => {
    const { fixture, proStore } = setup();
    const host = await publishMinimal(fixture);
    toggle(host, 'contact-whatsapp-toggle').click(); fixture.detectChanges();
    toggle(host, 'contact-calls-toggle').click(); fixture.detectChanges();
    type(host, 'ob-whatsapp', '249 15 412-3456'); fixture.detectChanges();
    // "Uso el mismo número de WhatsApp" viene marcado: no hay un segundo campo.
    expect(toggle(host, 'contact-same-number').checked).toBe(true);
    expect(host.querySelector('#ob-phone')).toBeNull();

    button(host, 'Guardar y continuar').click(); fixture.detectChanges();
    expect(host.querySelector('[role="alert"]')!.textContent).toContain('tenés que aceptar');
    expect(proStore.saveContact).not.toHaveBeenCalled();

    host.querySelector<HTMLInputElement>('[data-testid="contact-consent"] input')!.click(); fixture.detectChanges();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');
    button(host, 'Guardar y continuar').click();
    await fixture.whenStable(); fixture.detectChanges();
    expect(proStore.saveContact).toHaveBeenCalledOnce();
    expect(proStore.saveContact).toHaveBeenCalledWith({
      whatsappEnabled: true, callsEnabled: true, requestsEnabled: true, consent: true,
      whatsappNumber: '249 15 412-3456', phoneNumber: '249 15 412-3456', phoneKind: 'MOBILE',
    });
    expectWelcome(navigate);
  });

  it('solo llamadas a un fijo y sin solicitudes', async () => {
    const { fixture, proStore } = setup();
    const host = await publishMinimal(fixture);
    toggle(host, 'contact-calls-toggle').click(); fixture.detectChanges();
    expect(host.querySelector('[data-testid="contact-same-number"]')).toBeNull();
    type(host, 'ob-phone', '249 442-3456');
    [...host.querySelectorAll('label')].find((l) => l.textContent?.trim() === 'Fijo')!.querySelector('input')!.click();
    toggle(host, 'contact-requests-toggle').click();
    host.querySelector<HTMLInputElement>('[data-testid="contact-consent"] input')!.click();
    fixture.detectChanges();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');
    button(host, 'Guardar y continuar').click();
    await fixture.whenStable(); fixture.detectChanges();
    expect(proStore.saveContact).toHaveBeenCalledWith({
      whatsappEnabled: false, callsEnabled: true, requestsEnabled: false, consent: true,
      whatsappNumber: null, phoneNumber: '249 442-3456', phoneKind: 'LANDLINE',
    });
    expectWelcome(navigate);
  });

  it('un número inválido muestra el error junto al campo; el perfil ya creado sigue y se puede reintentar', async () => {
    const results: SaveContactResult[] = [
      { message: 'Revisá el número: escribilo con la característica (ej. 249 15 412-3456) o con + si es de otro país.', field: 'whatsappNumber' },
      { message: 'No pudimos guardar los cambios. Intentá de nuevo.', field: null },
      null,
    ];
    const { fixture, proStore, profileApi } = setup(undefined, async () => results.shift() ?? null);
    const host = await publishMinimal(fixture);
    toggle(host, 'contact-whatsapp-toggle').click(); fixture.detectChanges();
    type(host, 'ob-whatsapp', '4123');
    host.querySelector<HTMLInputElement>('[data-testid="contact-consent"] input')!.click();
    fixture.detectChanges();
    button(host, 'Guardar y continuar').click();
    await fixture.whenStable(); fixture.detectChanges();
    expect(host.querySelector('#ob-whatsapp')!.getAttribute('aria-invalid')).toBe('true');
    expect(host.querySelector('#ob-whatsapp-help')!.textContent).toContain('Revisá el número');
    expect(host.textContent).toContain('¿Cómo querés recibir clientes?');

    type(host, 'ob-whatsapp', '249 15 412-3456'); fixture.detectChanges();
    expect(host.querySelector('#ob-whatsapp')!.getAttribute('aria-invalid')).toBe('false');
    button(host, 'Guardar y continuar').click();
    await fixture.whenStable(); fixture.detectChanges();
    // Falla de red: sigue en el paso, con el aviso, sin volver a crear el perfil.
    expect(host.querySelector('[role="alert"]')!.textContent).toContain('No pudimos guardar');
    expect(host.textContent).toContain('¿Cómo querés recibir clientes?');

    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');
    button(host, 'Guardar y continuar').click();
    await fixture.whenStable(); fixture.detectChanges();
    expect(proStore.saveContact).toHaveBeenCalledTimes(3);
    expect(profileApi.createProfile).toHaveBeenCalledOnce();
    expectWelcome(navigate);
  });

  it('no deja enviar dos veces mientras guarda', async () => {
    let finish!: (r: SaveContactResult) => void;
    const { fixture, proStore } = setup(undefined, () => new Promise((resolve) => (finish = resolve)));
    const host = await publishMinimal(fixture);
    const submit = button(host, 'Guardar y continuar');
    submit.click();
    proStore.savingContact.set(true); fixture.detectChanges();
    expect(submit.disabled).toBe(true);
    expect(submit.textContent).toContain('Guardando…');
    expect(button(host, 'Configurar más tarde').disabled).toBe(true);
    submit.click();
    expect(proStore.saveContact).toHaveBeenCalledOnce();
    proStore.savingContact.set(false);
    finish(null);
    await fixture.whenStable();
  });

  it('no vuelve a aparecer: al recargar no queda un paso pendiente', async () => {
    const { fixture } = setup();
    await publishMinimal(fixture);
    fixture.destroy();
    // Con el perfil creado, /soy-profesional manda al panel (onboardingGuard); sin borrador no se repite.
    expect(draftRaw()).toBeNull();
  });
});

/** Hasta el paso del título con el servicio elegido (y Centro como barrio). */
async function toProfileStep(fixture: ReturnType<typeof setup>['fixture']): Promise<HTMLElement> {
  await fixture.whenStable(); fixture.detectChanges();
  const host = fixture.nativeElement as HTMLElement;
  (host.querySelector('input[type=checkbox]') as HTMLInputElement).click();
  button(host, 'Continuar').click(); fixture.detectChanges();
  pickZone(host, fixture, 'Centro');
  button(host, 'Continuar').click(); fixture.detectChanges();
  return host;
}

describe('alta profesional: 4 pasos, título sugerido y experiencia opcional', () => {
  it('son 4 pasos y ninguno es "Disponibilidad y requisitos"; urgencias no se pregunta en el alta', async () => {
    const { fixture, profileApi } = setup();
    const host = await toProfileStep(fixture);
    expect(host.textContent).toContain('Paso 3 de 4');
    expect(host.textContent).not.toContain('Disponibilidad y requisitos');
    button(host, 'Continuar').click(); fixture.detectChanges();
    expect(host.textContent).toContain('Paso 4 de 4');
    expect(host.textContent).not.toContain('Atiendo urgencias');
    button(host, 'Publicar perfil').click();
    await fixture.whenStable();
    expect((profileApi.createProfile.mock.calls[0] as unknown[])[0]).not.toHaveProperty('availableToday');
  });

  it('prellena el título con el primer oficio elegido y es editable; "años" llega vacío y no se envía como 0', async () => {
    const { fixture, profileApi } = setup();
    const host = await toProfileStep(fixture);
    const headline = host.querySelector<HTMLInputElement>('#pro-headline')!;
    expect(headline.value).toBe('Gas');
    expect(host.textContent).toContain('Lo completamos con tu primer oficio');
    expect(host.querySelector<HTMLInputElement>('#pro-years')!.value).toBe('');
    expect(host.textContent).toContain('Título profesional (obligatorio)');
    expect(host.textContent).toContain('Años de experiencia (opcional)');
    button(host, 'Continuar').click(); fixture.detectChanges();
    expect(host.querySelector('[data-testid=onboarding-preview]')!.textContent).not.toContain('de experiencia');
    button(host, 'Publicar perfil').click();
    await fixture.whenStable();
    const sent = (profileApi.createProfile.mock.calls[0] as unknown[])[0];
    expect(sent).toMatchObject({ headline: 'Gas' });
    expect(sent).not.toHaveProperty('yearsExperience');
  });

  it('un título escrito no se pisa al volver y cambiar de oficio; uno sugerido sí acompaña el cambio', async () => {
    const { fixture } = setup();
    const host = await toProfileStep(fixture);
    type(host, 'pro-headline', 'Gasista matriculado'); fixture.detectChanges();
    expect(host.textContent).not.toContain('Lo completamos con tu primer oficio');
    button(host, 'Atrás').click(); fixture.detectChanges();
    button(host, 'Atrás').click(); fixture.detectChanges();
    (host.querySelector('input[type=checkbox]') as HTMLInputElement).click(); // desmarca Gas
    (host.querySelector('input[type=checkbox]') as HTMLInputElement).click(); // vuelve a marcarlo
    button(host, 'Continuar').click(); fixture.detectChanges();
    button(host, 'Continuar').click(); fixture.detectChanges();
    expect(host.querySelector<HTMLInputElement>('#pro-headline')!.value).toBe('Gasista matriculado');
    // Borrarlo a propósito tampoco lo vuelve a completar solo.
    type(host, 'pro-headline', ''); fixture.detectChanges();
    button(host, 'Atrás').click(); fixture.detectChanges();
    button(host, 'Continuar').click(); fixture.detectChanges();
    expect(host.querySelector<HTMLInputElement>('#pro-headline')!.value).toBe('');
  });

  it('retomar un borrador con título escrito no lo pisa con la sugerencia', async () => {
    const { fixture } = setup();
    const host = await toProfileStep(fixture);
    type(host, 'pro-headline', 'Gasista matriculado'); fixture.detectChanges();
    fixture.destroy();
    const again = TestBed.createComponent(ProOnboardingPage);
    again.detectChanges(); await again.whenStable(); again.detectChanges();
    const restored = again.nativeElement as HTMLElement;
    expect(restored.textContent).toContain('Paso 3 de 4');
    expect(restored.querySelector<HTMLInputElement>('#pro-headline')!.value).toBe('Gasista matriculado');
    expect(restored.querySelector('[data-testid=draft-restored]')).not.toBeNull();
  });

  it('con años escritos los envía (también 0 si lo escribió a propósito); vacío es no informado', async () => {
    const { fixture, profileApi } = setup();
    const host = await toProfileStep(fixture);
    type(host, 'pro-years', '0'); fixture.detectChanges();
    button(host, 'Continuar').click(); fixture.detectChanges();
    button(host, 'Publicar perfil').click();
    await fixture.whenStable();
    expect(profileApi.createProfile).toHaveBeenCalledWith(expect.objectContaining({ yearsExperience: 0 }));
  });

  it('años fuera de rango o título vacío: avisa con foco en el error y no avanza', async () => {
    const { fixture } = setup();
    const host = await toProfileStep(fixture);
    type(host, 'pro-years', '80'); fixture.detectChanges();
    button(host, 'Continuar').click(); fixture.detectChanges();
    const alert = host.querySelector('#onboarding-error')!;
    expect(alert.textContent).toContain('entre 0 y 70');
    expect(host.querySelector('#pro-years')!.getAttribute('aria-invalid')).toBe('true');
    expect(host.textContent).toContain('Paso 3 de 4');
    type(host, 'pro-years', ''); type(host, 'pro-headline', '   '); fixture.detectChanges();
    button(host, 'Continuar').click(); fixture.detectChanges();
    expect(host.querySelector('#pro-headline')!.getAttribute('aria-invalid')).toBe('true');
    expect(host.querySelector('#onboarding-error')!.textContent).toContain('título profesional');
  });

  it('solo con un oficio sugerido: no hay título sugerido, escribe el suyo y termina sin publicar', async () => {
    const { fixture, profileApi } = setup(of({ id: PROFILE_ID } as OwnProfessional), undefined, [PENDING]);
    await fixture.whenStable(); fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    button(host, 'Continuar').click(); fixture.detectChanges();
    chooseCity(host, fixture, 'entire');
    button(host, 'Continuar').click(); fixture.detectChanges();
    const headline = host.querySelector<HTMLInputElement>('#pro-headline')!;
    expect(headline.value).toBe('');
    expect(headline.placeholder).toContain('Armado de pérgolas');
    type(host, 'pro-headline', 'Armo pérgolas'); fixture.detectChanges();
    button(host, 'Continuar').click(); fixture.detectChanges();
    expect(host.textContent).toContain('cumpla las demás condiciones');
    button(host, 'Crear perfil (sin publicar)').click();
    await fixture.whenStable(); fixture.detectChanges();
    expect(profileApi.createProfile).toHaveBeenCalledWith(expect.objectContaining({ serviceIds: [], headline: 'Armo pérgolas' }));
  });
});

describe('alta profesional: borrador en este navegador', () => {
  it('es por cuenta: otra cuenta del mismo navegador no lo recupera', async () => {
    const { fixture } = setup();
    await toProfileStep(fixture);
    expect(draftRaw()).not.toBeNull();
    fixture.destroy();
    TestBed.resetTestingModule();
    // Otra cuenta en el mismo navegador: arranca limpia y no toca el borrador de la primera.
    currentUser = { ...USER, id: 'user-2' };
    const second = setup();
    await second.fixture.whenStable(); second.fixture.detectChanges();
    const host = second.fixture.nativeElement as HTMLElement;
    expect(host.textContent).toContain('Paso 1 de 4');
    expect(draftRaw('user-1')).not.toBeNull();
  });

  it('lo que estaba guardado por la versión anterior (5 pasos, sessionStorage) se conserva', async () => {
    sessionStorage.setItem('resuelve:onboarding-pro:user-1', JSON.stringify({
      savedAt: Date.now(), step: 5, serviceIds: [SERVICE_ID], headline: 'Gasista', bio: '', yearsExperience: 0, availableToday: false,
      coverage: [{ locality: { id: TEST_LOCALITY.id, name: TEST_LOCALITY.name, slug: TEST_LOCALITY.slug, provinceName: 'Buenos Aires' }, coversEntireCity: true, zoneIds: [] }],
      primaryLocalityId: TEST_LOCALITY.id,
    }));
    const { fixture } = setup();
    await fixture.whenStable(); fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.textContent).toContain('Paso 4 de 4');
    expect(host.textContent).toContain('Gasista');
    expect(host.querySelector('[data-testid=draft-restored]')).not.toBeNull();
  });

  it('"Empezar de nuevo" borra el borrador y vuelve al paso 1 vacío', async () => {
    const { fixture } = setup();
    await toProfileStep(fixture);
    fixture.destroy();
    const again = TestBed.createComponent(ProOnboardingPage);
    again.detectChanges(); await again.whenStable(); again.detectChanges();
    const host = again.nativeElement as HTMLElement;
    button(host, 'Empezar de nuevo').click(); again.detectChanges();
    expect(host.textContent).toContain('Paso 1 de 4');
    expect(host.querySelector<HTMLInputElement>('input[type=checkbox]')!.checked).toBe(false);
    expect(host.querySelector('[data-testid=draft-restored]')).toBeNull();
    expect(draftRaw()).toBeNull();
  });

  it('se borra al crear el perfil', async () => {
    const { fixture } = setup();
    await publishMinimal(fixture);
    expect(draftRaw()).toBeNull();
  });

  it('vence a las 24 h de inactividad', async () => {
    const { fixture } = setup();
    await toProfileStep(fixture);
    fixture.destroy();
    const stored = draft();
    localStorage.setItem(draftKey('user-1'), JSON.stringify({ ...stored, savedAt: Date.now() - 25 * 60 * 60 * 1000 }));
    const again = TestBed.createComponent(ProOnboardingPage);
    again.detectChanges(); await again.whenStable(); again.detectChanges();
    expect((again.nativeElement as HTMLElement).textContent).toContain('Paso 1 de 4');
  });

  it('una pestaña vieja no pisa en silencio los cambios de otra: avisa y deja elegir', async () => {
    const { fixture } = setup();
    const host = await toProfileStep(fixture);
    // "Otra pestaña" guarda algo más nuevo en el mismo navegador.
    const newer = { ...draft(), rev: draft().rev + 5, headline: 'Desde otra pestaña', headlineEdited: true };
    localStorage.setItem(draftKey('user-1'), JSON.stringify(newer));
    type(host, 'pro-headline', 'Desde esta pestaña'); fixture.detectChanges();
    expect(host.querySelector('[data-testid=draft-conflict]')).not.toBeNull();
    expect(draft().headline).toBe('Desde otra pestaña'); // no se pisó
    button(host, 'Usar lo más reciente').click(); fixture.detectChanges();
    expect(host.querySelector<HTMLInputElement>('#pro-headline')!.value).toBe('Desde otra pestaña');
    expect(host.querySelector('[data-testid=draft-conflict]')).toBeNull();
    type(host, 'pro-headline', 'Ahora sí'); fixture.detectChanges();
    expect(draft().headline).toBe('Ahora sí');
  });

  it('"Seguir con esta pestaña" es una decisión explícita y recién ahí pisa', async () => {
    const { fixture } = setup();
    const host = await toProfileStep(fixture);
    localStorage.setItem(draftKey('user-1'), JSON.stringify({ ...draft(), rev: draft().rev + 5, headline: 'Otra' }));
    type(host, 'pro-headline', 'Esta'); fixture.detectChanges();
    button(host, 'Seguir con esta pestaña').click(); fixture.detectChanges();
    expect(draft().headline).toBe('Esta');
  });

  it('sin almacenamiento disponible el alta sigue funcionando y lo avisa', async () => {
    const { fixture } = setup();
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('bloqueado'); });
    try {
      const host = await toProfileStep(fixture);
      expect(host.textContent).toContain('no podemos guardar lo que cargás');
      expect(host.textContent).toContain('Paso 3 de 4');
    } finally {
      spy.mockRestore();
    }
  });

  it('no guarda en el borrador nada de la cuenta (ni contraseña ni teléfono ni email)', async () => {
    const { fixture } = setup();
    await toProfileStep(fixture);
    const raw = draftRaw()!;
    expect(raw).not.toContain('maria@example.com');
    expect(raw).not.toContain('555-1111');
    expect(raw).not.toMatch(/password|token/i);
  });

  it('"Configurar más tarde" deja CONTACT como visto en la sesión sin guardar nada', async () => {
    const { fixture, proStore } = setup();
    const host = await publishMinimal(fixture);
    button(host, 'Configurar más tarde').click();
    await fixture.whenStable();
    expect(proStore.saveContact).not.toHaveBeenCalled();
    expect(TestBed.inject(ActivationSession).skipped('user-1')).toContain('CONTACT');
  });

  it('guardar los canales no marca nada como salteado', async () => {
    const { fixture } = setup();
    const host = await publishMinimal(fixture);
    button(host, 'Guardar y continuar').click();
    await fixture.whenStable();
    expect(TestBed.inject(ActivationSession).skipped('user-1')).toEqual([]);
  });
});
