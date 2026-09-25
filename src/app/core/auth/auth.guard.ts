import { PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CanActivateFn, Router } from '@angular/router';
import { ToastService } from '../services/toast.service';
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

/**
 * Flujo REAL del profesional (/pro/solicitudes…): sesión + ProfessionalProfile.
 * Sin sesión → /ingresar. Sin perfil profesional → /pro/dashboard (demo) con
 * aviso. El backend igual exige el perfil (403 PROFESSIONAL_PROFILE_REQUIRED):
 * esto solo evita pedir algo que se sabe que va a fallar.
 */
export const professionalGuard: CanActivateFn = async (_route, state) => {
  if (!isPlatformBrowser(inject(PLATFORM_ID))) return true;
  const router = inject(Router);
  const auth = inject(AuthStore);
  const toast = inject(ToastService);
  await auth.whenReady();
  if (!auth.authenticated()) {
    const returnUrl = safeReturnUrl(state.url);
    return router.createUrlTree(['/ingresar'], { queryParams: returnUrl ? { returnUrl } : {} });
  }
  if (auth.user()?.professionalProfileId) return true;
  toast.show('Para ver solicitudes necesitás un perfil profesional.', 3600, 'info');
  return router.createUrlTree(['/pro/dashboard']);
};
