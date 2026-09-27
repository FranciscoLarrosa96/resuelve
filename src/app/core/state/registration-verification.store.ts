import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { AuthApiService } from '../api/auth-api.service';
import { AuthResponse } from '../models/auth';

const STORAGE_KEY = 'resuelve.pendingRegistration';

interface PersistedState {
  sessionId: string;
  maskedEmail: string;
  /** epoch ms: cuándo se mandó el último código (para el cooldown, sobrevive a un F5). */
  codeSentAt: number;
}

/**
 * Registro pendiente (`POST /auth/register`): todavía NO hay sesión ni
 * `User`. Vive en `sessionStorage` (sobrevive un F5 en `/verificar-email`)
 * y nunca guarda contraseña, código ni ningún secreto — solo el id de
 * sesión (opaco) y el email enmascarado.
 *
 * Deliberadamente no conoce a `AuthStore`: `verify()` solo devuelve los
 * tokens nuevos; quien la usa (hoy, `VerifyEmailPage`) es quien le pide a
 * `AuthStore.completeExternalAuth` que abra la sesión, evitando una
 * dependencia circular entre los dos stores.
 */
@Injectable({ providedIn: 'root' })
export class RegistrationVerificationStore {
  private readonly api = inject(AuthApiService);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly _sessionId = signal<string | null>(null);
  private readonly _maskedEmail = signal<string | null>(null);
  private readonly _codeSentAt = signal<number | null>(null);
  readonly sessionId = this._sessionId.asReadonly();
  readonly maskedEmail = this._maskedEmail.asReadonly();
  readonly codeSentAt = this._codeSentAt.asReadonly();

  constructor() {
    if (this.browser) this.restore();
  }

  start(sessionId: string, maskedEmail: string): void {
    this._sessionId.set(sessionId);
    this._maskedEmail.set(maskedEmail);
    this._codeSentAt.set(Date.now());
    this.persist();
  }

  /** "Usar otro email": sin sesión ni `User`, alcanza con olvidar el registro pendiente. */
  clear(): void {
    this._sessionId.set(null);
    this._maskedEmail.set(null);
    this._codeSentAt.set(null);
    if (this.browser) sessionStorage.removeItem(STORAGE_KEY);
  }

  /** Código correcto → tokens de la cuenta recién creada. No abre la sesión: eso lo hace el llamador. */
  async verify(code: string): Promise<AuthResponse> {
    const sessionId = this._sessionId();
    if (!sessionId) throw new Error('No hay un registro pendiente');
    return firstValueFrom(this.api.verifyRegistration(sessionId, code));
  }

  async resend(): Promise<void> {
    const sessionId = this._sessionId();
    if (!sessionId) throw new Error('No hay un registro pendiente');
    await firstValueFrom(this.api.resendRegistrationCode(sessionId));
    this._codeSentAt.set(Date.now());
    this.persist();
  }

  private persist(): void {
    if (!this.browser) return;
    const state: PersistedState = {
      sessionId: this._sessionId()!,
      maskedEmail: this._maskedEmail()!,
      codeSentAt: this._codeSentAt()!,
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  private restore(): void {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw) as Partial<PersistedState>;
      if (!data.sessionId || !data.maskedEmail || !data.codeSentAt) return;
      this._sessionId.set(data.sessionId);
      this._maskedEmail.set(data.maskedEmail);
      this._codeSentAt.set(data.codeSentAt);
    } catch {
      /* sessionStorage corrupto o inaccesible: como si no hubiera registro pendiente */
    }
  }
}
