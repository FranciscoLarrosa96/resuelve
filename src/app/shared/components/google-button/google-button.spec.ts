import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_URL } from '../../../core/api/api.config';
import { setGoogleSignInOffline } from '../../../core/auth/google-sign-in';
import { GoogleButton } from './google-button';

const API = 'http://api.test/api/v1';

describe('GoogleButton', () => {
  beforeEach(() => setGoogleSignInOffline(false));
  afterEach(() => {
    setGoogleSignInOffline(true);
    delete (window as { google?: unknown }).google;
  });

  function render() {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: API_URL, useValue: API }],
    });
    const fixture = TestBed.createComponent(GoogleButton);
    fixture.detectChanges();
    return { fixture, http: TestBed.inject(HttpTestingController), el: fixture.nativeElement as HTMLElement };
  }
  const flush = () => new Promise((r) => setTimeout(r));

  it('sin GOOGLE_CLIENT_ID en el backend no muestra nada ni carga el script de Google', async () => {
    const { fixture, http, el } = render();
    await fixture.whenStable();
    http.expectOne(`${API}/auth/providers`).flush({ googleClientId: null });
    await flush();
    fixture.detectChanges();
    expect(el.querySelector<HTMLElement>('[data-testid="google-button"]')!.hidden).toBe(true);
    expect(document.querySelector('script[src*="accounts.google.com"]')).toBeNull();
    http.verify();
  });

  it('con Google habilitado dibuja el botón oficial y emite el token que devuelve Google', async () => {
    const renderButton = vi.fn();
    let callback: ((r: { credential?: string }) => void) | undefined;
    (window as { google?: unknown }).google = {
      accounts: {
        id: {
          initialize: (config: { client_id: string; callback: (r: { credential?: string }) => void }) => {
            expect(config.client_id).toBe('cliente.apps.googleusercontent.com');
            callback = config.callback;
          },
          renderButton,
        },
      },
    };
    const { fixture, http, el } = render();
    const got: string[] = [];
    fixture.componentInstance.credential.subscribe((c) => got.push(c));
    await fixture.whenStable();
    http.expectOne(`${API}/auth/providers`).flush({ googleClientId: 'cliente.apps.googleusercontent.com' });
    await flush();
    fixture.detectChanges();
    expect(el.querySelector<HTMLElement>('[data-testid="google-button"]')!.hidden).toBe(false);
    expect(renderButton).toHaveBeenCalledWith(expect.any(HTMLElement), expect.objectContaining({ text: 'continue_with', locale: 'es-419' }));
    callback!({ credential: 'id-token' });
    expect(got).toEqual(['id-token']);
  });
});
