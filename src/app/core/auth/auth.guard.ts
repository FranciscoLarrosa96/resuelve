import { PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CanActivateFn, Router } from '@angular/router';
import { ToastService } from '../services/toast.service';
import { AuthStore } from '../state/auth.store';
import { RegistrationVerificationStore } from '../state/registration-verification.store';
import { afterLoginUrl, safeReturnUrl } from './return-url';

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
  return router.parseUrl(afterLoginUrl(route.queryParamMap.get('returnUrl'), auth.user()));
};

/** La misma cuenta se usa para el alta. Si ya existe un perfil, abre el panel. */
export const onboardingGuard: CanActivateFn = async (_route, state) => {
  if (!isPlatformBrowser(inject(PLATFORM_ID))) return true;
  const router = inject(Router);
  const auth = inject(AuthStore);
  await auth.whenReady();
  if (!auth.authenticated()) {
    // Quien llega sin sesión (típico: escaneó el QR del volante) casi seguro no tiene cuenta: registro primero; "¿Ya tenés cuenta?" lleva a ingresar con el mismo returnUrl.
    return router.createUrlTree(['/registro'], { queryParams: { returnUrl: state.url } });
  }
  if (auth.user()?.professionalProfileId) return router.createUrlTree(['/pro/dashboard']);
  return true;
};

/**
 * /verificar-email: parte del registro (registro pendiente, SIN sesión) o,
 * para cuentas legacy, una pantalla autenticada sin verificar. Con un
 * registro pendiente en curso (sin sesión) no exige token; con sesión se ignora y se limpia; ya verificado no tiene
 * sentido, sigue al returnUrl o al inicio del cliente.
 */
export const emailVerificationGuard: CanActivateFn = async (route) => {
  if (!isPlatformBrowser(inject(PLATFORM_ID))) return true;
  const router = inject(Router);
  const auth = inject(AuthStore);
  const pending = inject(RegistrationVerificationStore);
  await auth.whenReady();
  if (!auth.authenticated()) {
    return pending.sessionId() ? true : router.createUrlTree(['/registro']);
  }
  // Con sesión manda la cuenta real: un registro pendiente viejo (otro email) no tiene sentido.
  pending.clear();
  if (auth.user()?.emailVerified) {
    return router.parseUrl(afterLoginUrl(route.queryParamMap.get('returnUrl'), auth.user()));
  }
  return true;
};

/**
 * Flujo REAL del profesional (/pro/solicitudes…): sesión + ProfessionalProfile.
 * Sin sesión → /ingresar. Sin perfil profesional → /soy-profesional.
 * El backend igual exige el perfil (403 PROFESSIONAL_PROFILE_REQUIRED):
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
  toast.show('Creá tu perfil profesional para continuar.', 3600, 'info');
  return router.createUrlTree(['/soy-profesional']);
};

/**
 * Panel /admin: sesión + `isAdmin`. Un usuario común vuelve al inicio, igual
 * que con cualquier ruta inexistente. La protección real es la API (404 para
 * quien no es admin): esto solo evita mostrar una pantalla que no va a cargar.
 */
export const adminGuard: CanActivateFn = async (_route, state) => {
  if (!isPlatformBrowser(inject(PLATFORM_ID))) return true;
  const router = inject(Router);
  const auth = inject(AuthStore);
  await auth.whenReady();
  if (!auth.authenticated()) {
    const returnUrl = safeReturnUrl(state.url);
    return router.createUrlTree(['/ingresar'], { queryParams: returnUrl ? { returnUrl } : {} });
  }
  return auth.user()?.isAdmin ? true : router.createUrlTree(['/']);
};
