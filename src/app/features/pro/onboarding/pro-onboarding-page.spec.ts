import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ServiceSuggestions } from '../../../shared/components/service-suggestions/service-suggestions';
import { HttpErrorResponse } from '@angular/common/http';
import { Router, provideRouter } from '@angular/router';
import { Observable, Subject, of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { CatalogApiService } from '../../../core/api/catalog-api.service';
import { CreateProfessionalProfile, OwnProfessional, ProProfileApiService } from '../../../core/api/pro-profile-api.service';
import { AuthUser } from '../../../core/models/auth';
import { AuthStore } from '../../../core/state/auth.store';
import { ProStore } from '../../../core/state/pro.store';
import { ContactSettingsInput } from '../../../core/models/pro-profile';
import { LocalitiesApiService } from '../../../core/api/localities-api.service';
import { TEST_LOCALITY, useTestLocality } from '../../../core/state/locality.testing';
import { LocalityStore } from '../../../core/state/locality.store';
import { WELCOME_STATE } from '../../../core/auth/auth.guard';
import { ProOnboardingPage } from './pro-onboarding-page';

/** Terminó el alta: la bienvenida se abre en el área profesional, una vez (estado de navegación). */
function expectWelcome(navigate: ReturnType<typeof vi.spyOn>) {
  expect(navigate).toHaveBeenCalledWith('/pro/bienvenida', { replaceUrl: true, state: { [WELCOME_STATE]: true } });
}

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

function setup(
  response: Observable<OwnProfessional> = of({ id: PROFILE_ID } as OwnProfessional),
  saveContact: (input: ContactSettingsInput) => Promise<SaveContactResult> = async () => null,
) {
  useTestLocality();
  const user = signal<AuthUser | null>(USER);
  const auth = { user, displayName: signal('María Pérez'), loadMe: vi.fn(async () => {
    user.set({ ...USER, professionalProfileId: PROFILE_ID });
    return user();
  }) };
  const profileApi = { createProfile: vi.fn(() => response) };
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

beforeEach(() => sessionStorage.clear());

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
    expect(JSON.parse(sessionStorage.getItem('resuelve:onboarding-pro:user-1')!).serviceIds).toEqual([id]);
    button(host, 'Continuar').click(); fixture.detectChanges();
    expect(host.querySelector('#onboarding-title')?.textContent).toContain('Dónde trabajás');
  });

  it('arranca en "Tus servicios" (sin pantalla de presentación) y "Atrás" en el paso 1 vuelve a /trabaja-con-resuelve', async () => {
    const { fixture } = setup();
    await fixture.whenStable();
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('#onboarding-title')!.textContent).toContain('Tus servicios');
    expect(host.textContent).toContain('Paso 1 de 5');
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
    expect(JSON.parse(sessionStorage.getItem('resuelve:onboarding-pro:user-1')!).specialties)
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
    (host.querySelector('input[type=checkbox]') as HTMLInputElement).click();
    button(host, 'Continuar').click();
    fixture.detectChanges();
    expect(host.textContent).toContain('Gasista en Tandil');
    button(host, 'Publicar perfil').click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(profileApi.createProfile).toHaveBeenCalledOnce();
    expect(profileApi.createProfile).toHaveBeenCalledWith({
      headline: 'Gasista en Tandil', bio: undefined, yearsExperience: 0,
      serviceIds: [SERVICE_ID], availableToday: true,
      specialties: [{ serviceId: SERVICE_ID, names: ['Reparación de calderas'] }],
      primaryLocalityId: TEST_LOCALITY.id,
      coverage: [{ localityId: TEST_LOCALITY.id, coversEntireCity: false, zoneIds: [ZONE_ID] }],
    } satisfies CreateProfessionalProfile);
    expect(auth.loadMe).toHaveBeenCalledOnce();
    expect(host.textContent).toContain('¿Cómo querés recibir clientes?');
    expect(sessionStorage.getItem('resuelve:onboarding-pro:user-1')).toBeNull();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');
    button(host, 'Configurar más tarde').click();
    await fixture.whenStable();
    expectWelcome(navigate);
    expect(sessionStorage.getItem('resuelve:onboarding-pro:user-1')).toBeNull();
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
    expect(sessionStorage.getItem('resuelve:onboarding-pro:user-1')).toContain(SERVICE_ID);
    fixture.destroy();

    const again = TestBed.createComponent(ProOnboardingPage);
    again.detectChanges();
    await again.whenStable();
    again.detectChanges();
    const restored = again.nativeElement as HTMLElement;
    expect(restored.textContent).toContain('Paso 1 de 5');
    expect(restored.querySelector<HTMLInputElement>('input[type=checkbox]')?.checked).toBe(true);
  });

  it('en la revisión concuerda el singular y el plural de los años de experiencia', async () => {
    for (const [years, expected] of [[1, '1 año'], [3, '3 años']] as const) {
      sessionStorage.clear();
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
      button(host, 'Continuar').click(); fixture.detectChanges();
      const experience = [...host.querySelectorAll('dt')].find((d) => d.textContent === 'Experiencia')!.nextElementSibling!;
      expect(experience.textContent!.trim()).toBe(expected);
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
    button(host, 'Continuar').click(); fixture.detectChanges();
    button(host, 'Publicar perfil').click();
    await fixture.whenStable(); fixture.detectChanges();
    expect(navigate).toHaveBeenCalledWith(['/verificar-email'], { queryParams: { returnUrl: '/soy-profesional' } });
    expect(sessionStorage.getItem('resuelve:onboarding-pro:user-1')).toContain('Gasista');
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
    button(host, 'Continuar').click(); fixture.detectChanges();
    button(host, 'Publicar perfil').click();
    await fixture.whenStable(); fixture.detectChanges();
    expect(host.querySelector('[role=alert]')?.textContent).toContain('Tus datos siguen guardados');
    expect(sessionStorage.getItem('resuelve:onboarding-pro:user-1')).toContain('Gasista');
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
    expect(sessionStorage.getItem('resuelve:onboarding-pro:user-1')).toBeNull();
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
    expect(sessionStorage.getItem('resuelve:onboarding-pro:user-1')).toBeNull();
  });
});
