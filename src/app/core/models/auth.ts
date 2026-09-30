/**
 * Contratos de auth, espejo exacto del backend:
 * - RegisterDto / LoginDto / RefreshDto / AuthTokensDto (backend/src/auth/dto/auth.dto.ts)
 * - GET /auth/me → presentMe() (backend/src/users/user.presenter.ts)
 */

/** Usuario autenticado tal como lo devuelve GET /auth/me. */
export interface AuthUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  phoneVerified: boolean;
  /** Null hasta que la cuenta demuestra que controla el email (backend siempre autoritativo). */
  emailVerifiedAt: string | null;
  emailVerified: boolean;
  avatarUrl: string | null;
  defaultZoneId: string | null;
  /** Id del ProfessionalProfile si activó el modo profesional; null si no. */
  professionalProfileId: string | null;
  /** Acceso al panel /admin. Solo habilita la ruta: la API lo vuelve a chequear en cada pedido. */
  isAdmin?: boolean;
  /** ISO 8601. */
  createdAt: string;
}

/** POST /auth/register. `phone` y `defaultZoneId` son opcionales. */
export interface RegisterRequest {
  referralCode?: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  phone?: string;
  defaultZoneId?: string;
}

/** POST /auth/login. */
export interface LoginRequest {
  email: string;
  password: string;
}

/** Body de POST /auth/refresh y POST /auth/logout. */
export interface RefreshRequest {
  refreshToken: string;
}

/** Respuesta de login, refresh y de verificar un registro pendiente. */
export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  /** Segundos hasta que vence el access token. */
  expiresIn: number;
  tokenType: 'Bearer';
}

/**
 * Respuesta de `POST /auth/register`. Con la verificación de email apagada
 * (hoy, `EMAIL_VERIFICATION_ENABLED=false`) crea la cuenta y trae tokens.
 * Encendida, NO crea la cuenta: abre un registro pendiente y recién
 * `POST /auth/register/verify` crea el `User` y emite tokens.
 */
export type RegisterResponse = AuthResponse | PendingRegistrationResponse;

export interface PendingRegistrationResponse {
  verificationRequired: true;
  verificationSessionId: string;
  maskedEmail: string;
}

export function isPendingRegistration(res: RegisterResponse): res is PendingRegistrationResponse {
  return 'verificationRequired' in res && res.verificationRequired === true;
}

/** Límites de RegisterDto / LoginDto (el backend sigue siendo la autoridad). */
export const AUTH_LIMITS = {
  nameMax: 80,
  emailMax: 254,
  passwordMin: 10,
  passwordMax: 128,
  /** Mismo patrón que RegisterDto.phone. */
  phonePattern: /^\+?[0-9 ()-]{6,32}$/,
} as const;
