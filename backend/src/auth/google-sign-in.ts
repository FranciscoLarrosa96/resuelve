import { OAuth2Client } from 'google-auth-library';

/**
 * Ingreso con Google (Google Identity Services). El navegador obtiene un ID token
 * (JWT firmado por Google) y lo manda a POST /auth/google; acá se verifica la firma,
 * el emisor, el vencimiento y que la audiencia sea NUESTRO `GOOGLE_CLIENT_ID`.
 * Nunca se confía en datos que mande el navegador por fuera del token.
 */
export interface GoogleIdentity {
  /** Identificador estable de la cuenta de Google. */
  sub: string;
  email: string;
  firstName: string;
  lastName: string;
}

export interface GoogleTokenVerifier {
  verify(idToken: string, clientId: string): Promise<GoogleIdentity | null>;
}

/** Recorta y limita a lo que admite `users` (80 caracteres). */
const name = (value: string | undefined) => (value ?? '').trim().slice(0, 80);

/** Verificador real (descarga y cachea las claves públicas de Google). */
export class GoogleAuthLibraryVerifier implements GoogleTokenVerifier {
  private readonly client = new OAuth2Client();

  async verify(idToken: string, clientId: string): Promise<GoogleIdentity | null> {
    try {
      const ticket = await this.client.verifyIdToken({ idToken, audience: clientId });
      return identityFromPayload(ticket.getPayload());
    } catch {
      return null;
    }
  }
}

/** Solo emails verificados por Google; sin email no hay cuenta. */
export function identityFromPayload(
  payload:
    | { sub?: string; email?: string; email_verified?: boolean; given_name?: string; family_name?: string; name?: string }
    | undefined,
): GoogleIdentity | null {
  if (!payload?.sub || !payload.email || payload.email_verified !== true) return null;
  const given = name(payload.given_name);
  const family = name(payload.family_name);
  // Cuentas sin nombre separado: se usa el nombre completo como nombre de pila.
  const firstName = given || name(payload.name) || payload.email.split('@')[0].slice(0, 80);
  return { sub: payload.sub, email: payload.email.trim().toLowerCase(), firstName, lastName: family };
}

export const GOOGLE_TOKEN_VERIFIER = Symbol('GOOGLE_TOKEN_VERIFIER');
