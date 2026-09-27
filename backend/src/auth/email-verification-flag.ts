import { ConfigService } from '@nestjs/config';

/**
 * `EMAIL_VERIFICATION_ENABLED` (default false). Apagado, `POST /auth/register`
 * crea la cuenta y devuelve tokens (sin código) y `EmailVerifiedGuard` deja
 * pasar. Encendido, vuelve el registro pendiente con código por email.
 */
export function emailVerificationEnabled(config: ConfigService): boolean {
  return config.get<boolean>('EMAIL_VERIFICATION_ENABLED', false) === true;
}
