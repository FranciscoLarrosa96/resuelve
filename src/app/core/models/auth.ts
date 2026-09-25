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
  avatarUrl: string | null;
  defaultZoneId: string | null;
  /** Id del ProfessionalProfile si activó el modo profesional; null si no. */
  professionalProfileId: string | null;
  /** ISO 8601. */
  createdAt: string;
}

/** POST /auth/register. `phone` y `defaultZoneId` son opcionales. */
export interface RegisterRequest {
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

/** Respuesta de register, login y refresh. */
export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  /** Segundos hasta que vence el access token. */
  expiresIn: number;
  tokenType: 'Bearer';
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
