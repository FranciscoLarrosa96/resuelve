import { HttpClient, HttpContext, HttpContextToken } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { AuthResponse, AuthUser, LoginRequest, RefreshRequest, RegisterRequest, RegisterResponse } from '../models/auth';
import { API_URL } from './api.config';

/**
 * Marca requests que el interceptor de auth no debe tocar: ni header
 * Authorization ni refresh ante 401 (login, register, refresh, logout).
 */
export const SKIP_AUTH = new HttpContextToken<boolean>(() => false);
const publicAuth = () => ({ context: new HttpContext().set(SKIP_AUTH, true) });

/** Endpoints /auth del backend. */
@Injectable({ providedIn: 'root' })
export class AuthApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_URL);

  /** NO crea la cuenta ni autentica: crea un registro pendiente y manda el código. */
  register(body: RegisterRequest): Observable<RegisterResponse> {
    return this.http.post<RegisterResponse>(`${this.baseUrl}/auth/register`, body, publicAuth());
  }

  /** Único llamado que crea la cuenta real y devuelve tokens para un registro nuevo. */
  verifyRegistration(verificationSessionId: string, code: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(
      `${this.baseUrl}/auth/register/verify`,
      { verificationSessionId, code },
      publicAuth(),
    );
  }

  resendRegistrationCode(verificationSessionId: string): Observable<void> {
    return this.http.post<void>(
      `${this.baseUrl}/auth/register/resend-code`,
      { verificationSessionId },
      publicAuth(),
    );
  }

  login(body: LoginRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.baseUrl}/auth/login`, body, publicAuth());
  }

  /** Rota: el refresh token enviado deja de servir. */
  refresh(body: RefreshRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.baseUrl}/auth/refresh`, body, publicAuth());
  }

  /** 204 siempre (idempotente). */
  logout(body: RefreshRequest): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/auth/logout`, body, publicAuth());
  }

  /** Requiere Bearer: lo agrega el interceptor. */
  me(): Observable<AuthUser> {
    return this.http.get<AuthUser>(`${this.baseUrl}/auth/me`);
  }

  /** Guarda la ciudad elegida en la cuenta (null la borra). */
  setPreferredLocality(localityId: string | null): Observable<AuthUser> {
    return this.http.put<AuthUser>(`${this.baseUrl}/auth/me/locality`, { localityId });
  }

  /** Envía (o reenvía) el código de 6 dígitos al email de la cuenta. */
  sendEmailVerification(): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/auth/email-verification/send`, {});
  }

  verifyEmail(code: string): Observable<{ emailVerifiedAt: string }> {
    return this.http.post<{ emailVerifiedAt: string }>(`${this.baseUrl}/auth/email-verification/verify`, { code });
  }

  /** Antes de verificar: cambia el email (typo) y manda un código nuevo. */
  changeEmail(email: string, password: string): Observable<void> {
    return this.http.patch<void>(`${this.baseUrl}/auth/email`, { email, password });
  }
}
