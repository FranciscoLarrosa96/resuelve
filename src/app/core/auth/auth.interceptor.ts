import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { API_URL } from '../api/api.config';
import { SKIP_AUTH } from '../api/auth-api.service';
import { AuthStore } from '../state/auth.store';

const withBearer = (req: HttpRequest<unknown>, token: string) =>
  req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });

/**
 * Agrega `Authorization: Bearer <accessToken>` a las requests a nuestra API
 * cuando hay sesión. Ante un 401 renueva el token UNA vez (refresh
 * compartido entre requests concurrentes) y reintenta la request original
 * una sola vez. Nunca actúa sobre /auth/login|register|refresh|logout
 * (SKIP_AUTH), así que no puede entrar en loop.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const apiUrl = inject(API_URL);
  if (req.context.get(SKIP_AUTH) || !apiUrl || !req.url.startsWith(apiUrl)) return next(req);

  const auth = inject(AuthStore);
  const token = auth.accessToken();
  if (!token) return next(req);

  return next(withBearer(req, token)).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse) || error.status !== 401) return throwError(() => error);
      // Otro request ya renovó mientras este viajaba: reintentar con el token vigente.
      const current = auth.accessToken();
      if (current && current !== token) return next(withBearer(req, current));
      if (!auth.hasRefreshToken()) {
        auth.sessionExpired();
        return throwError(() => error);
      }
      return auth.refresh().pipe(
        catchError(() => {
          auth.sessionExpired();
          return throwError(() => error);
        }),
        // `next` (no el interceptor completo): el reintento es único; si vuelve 401, se propaga.
        switchMap((fresh) => next(withBearer(req, fresh))),
      );
    }),
  );
};
