import { setContactFollowupsOffline } from './app/shared/components/contact-followup/contact-followup';
import { setGoogleSignInOffline } from './app/core/auth/google-sign-in';
import { beforeEach } from 'vitest';

// El refresh token vive en localStorage (compartido y persistente): ningún
// test hereda la sesión que dejó otro.
beforeEach(() => localStorage.removeItem('resuelve.refreshToken'));

// «Continuar con Google» no consulta el backend en los tests (salvo los que lo prueban).
setGoogleSignInOffline(true);
setContactFollowupsOffline(true);
