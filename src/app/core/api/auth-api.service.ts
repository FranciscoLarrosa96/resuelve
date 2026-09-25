import { HttpClient, HttpContext, HttpContextToken } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { AuthResponse, AuthUser, LoginRequest, RefreshRequest, RegisterRequest } from '../models/auth';
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

  register(body: RegisterRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.baseUrl}/auth/register`, body, publicAuth());
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
}
