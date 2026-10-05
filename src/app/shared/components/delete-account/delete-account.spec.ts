import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_URL } from '../../../core/api/api.config';
import { AuthStore } from '../../../core/state/auth.store';
import { DELETE_ACCOUNT_MESSAGES, DeleteAccount } from './delete-account';

const API = 'http://api.test/api/v1';
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

async function setup() {
  const auth = { accountDeleted: vi.fn() };
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: API_URL, useValue: API },
      { provide: AuthStore, useValue: auth },
    ],
  });
  const http = TestBed.inject(HttpTestingController);
  const fixture = TestBed.createComponent(DeleteAccount);
  fixture.detectChanges();
  const host = fixture.nativeElement as HTMLElement;
  const text = () => host.textContent!.replace(/\s+/g, ' ');
  const button = (label: string) => [...host.querySelectorAll('button')].find((b) => b.textContent!.trim() === label) as HTMLButtonElement | undefined;
  const openWith = async (check: object) => {
    button('Eliminar mi cuenta')!.click();
    http.expectOne({ method: 'GET', url: `${API}/account/deletion-check` }).flush(check);
    await flush();
    fixture.detectChanges();
  };
  const type = (value: string) => {
    const input = host.querySelector<HTMLInputElement>('#delete-account-password')!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };
  return { auth, http, fixture, host, text, button, openWith, type };
}

describe('DeleteAccount', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('sin impedimentos: explica qué se borra, pide la contraseña y recién ahí habilita eliminar', async () => {
    const { text, button, openWith, type, fixture } = await setup();
    await openWith({ canDelete: true, blockers: [] });
    expect(text()).toContain('Tu nombre, email, teléfono y foto se borran');
    expect(text()).toContain('Usuario eliminado');
    expect(text()).toContain('Escribí tu contraseña para confirmar');
    const confirm = () => [...document.querySelectorAll('button')].filter((b) => b.textContent!.trim() === 'Eliminar mi cuenta').at(-1) as HTMLButtonElement;
    expect(button('Volver')).toBeTruthy();
    expect(confirm().disabled).toBe(true);
    type('una-clave');
    fixture.detectChanges();
    expect(confirm().disabled).toBe(false);
  });

  it('con trabajos en curso o suscripción PRO: lo dice y no ofrece eliminar', async () => {
    const { text, host, openWith, button } = await setup();
    await openWith({
      canDelete: false,
      blockers: [{ code: 'ACTIVE_JOBS', count: 1, message: 'Tenés 1 trabajo en curso con otra persona.' }],
    });
    expect(text()).toContain(DELETE_ACCOUNT_MESSAGES.blocked);
    expect(host.querySelector('[data-testid="delete-blockers"]')?.textContent).toContain('1 trabajo en curso');
    expect(host.querySelector('#delete-account-password')).toBeNull();
    expect(button('Entendido')).toBeTruthy();
  });

  it('confirmar manda la contraseña y, si el backend elimina, cierra la sesión local', async () => {
    const { auth, http, openWith, type, fixture } = await setup();
    await openWith({ canDelete: true, blockers: [] });
    type('una-clave');
    const confirm = [...document.querySelectorAll('button')].filter((b) => b.textContent!.trim() === 'Eliminar mi cuenta').at(-1) as HTMLButtonElement;
    confirm.click();
    const req = http.expectOne({ method: 'POST', url: `${API}/account/delete` });
    expect(req.request.body).toEqual({ password: 'una-clave' });
    req.flush({ deleted: true });
    await flush();
    fixture.detectChanges();
    expect(auth.accountDeleted).toHaveBeenCalledTimes(1);
  });

  it('contraseña incorrecta (403): lo avisa en el campo y no cierra la sesión', async () => {
    const { auth, http, text, openWith, type, fixture } = await setup();
    await openWith({ canDelete: true, blockers: [] });
    type('mala');
    const confirm = [...document.querySelectorAll('button')].filter((b) => b.textContent!.trim() === 'Eliminar mi cuenta').at(-1) as HTMLButtonElement;
    confirm.click();
    http
      .expectOne({ method: 'POST', url: `${API}/account/delete` })
      .flush({ code: 'ACCOUNT_PASSWORD_INCORRECT', message: 'x' }, { status: 403, statusText: 'Forbidden' });
    await flush();
    fixture.detectChanges();
    expect(text()).toContain(DELETE_ACCOUNT_MESSAGES.wrongPassword);
    expect(auth.accountDeleted).not.toHaveBeenCalled();
  });

  it('si apareció un impedimento mientras tanto (409): relee y lo muestra', async () => {
    const { http, host, openWith, type, fixture } = await setup();
    await openWith({ canDelete: true, blockers: [] });
    type('una-clave');
    const confirm = [...document.querySelectorAll('button')].filter((b) => b.textContent!.trim() === 'Eliminar mi cuenta').at(-1) as HTMLButtonElement;
    confirm.click();
    http
      .expectOne({ method: 'POST', url: `${API}/account/delete` })
      .flush({ code: 'ACCOUNT_DELETE_BLOCKED', message: 'x' }, { status: 409, statusText: 'Conflict' });
    await flush();
    http
      .expectOne({ method: 'GET', url: `${API}/account/deletion-check` })
      .flush({ canDelete: false, blockers: [{ code: 'OPEN_SUBSCRIPTION', count: 1, message: 'Tenés una suscripción a Resuelve PRO.' }] });
    await flush();
    fixture.detectChanges();
    expect(host.querySelector('[data-testid="delete-blockers"]')?.textContent).toContain('suscripción');
  });
});
