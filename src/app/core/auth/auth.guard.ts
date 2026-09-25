import { PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CanActivateFn, Router } from '@angular/router';
import { AuthStore } from '../state/auth.store';
import { safeReturnUrl } from './return-url';

/**
 * Áreas personales (/perfil, /mis-solicitudes). Espera a que termine la
 * restauración de sesión; si no hay usuario manda a /ingresar con un
 * returnUrl interno. En el servidor (prerender) no hay sesión: deja pasar
 * y la pantalla muestra "Cargando tu sesión…" sin datos personales; en el
 * navegador el guard vuelve a decidir.
 */
export const authGuard: CanActivateFn = async (_route, state) => {
  if (!isPlatformBrowser(inject(PLATFORM_ID))) return true;
  // inject() antes del await: después ya no hay contexto de inyección.
  const router = inject(Router);
  const auth = inject(AuthStore);
  await auth.whenReady();
  if (auth.authenticated()) return true;
  const returnUrl = safeReturnUrl(state.url);
  return router.createUrlTree(['/ingresar'], { queryParams: returnUrl ? { returnUrl } : {} });
};

/** /ingresar y /registro: con sesión iniciada no tienen sentido. */
export const guestGuard: CanActivateFn = async (route) => {
  if (!isPlatformBrowser(inject(PLATFORM_ID))) return true;
  // inject() antes del await: después ya no hay contexto de inyección.
  const router = inject(Router);
  const auth = inject(AuthStore);
  await auth.whenReady();
  if (!auth.authenticated()) return true;
  return router.parseUrl(safeReturnUrl(route.queryParamMap.get('returnUrl')) ?? '/perfil');
};
