import { beforeEach } from 'vitest';

// El refresh token vive en localStorage (compartido y persistente): ningún
// test hereda la sesión que dejó otro.
beforeEach(() => localStorage.removeItem('resuelve.refreshToken'));
