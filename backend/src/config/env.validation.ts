import { plainToInstance, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

/** Variables de entorno obligatorias/opcionales. La app no arranca si alguna es inválida. */
export class EnvironmentVariables {
  @IsIn(['development', 'production', 'test'])
  NODE_ENV: 'development' | 'production' | 'test' = 'development';

  @Transform(({ value }) => (value === undefined || value === '' ? 3000 : Number(value)))
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT = 3000;

  @IsString()
  @IsNotEmpty({ message: 'DATABASE_URL es obligatoria (postgres://usuario:clave@host:puerto/base)' })
  DATABASE_URL: string;

  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  DATABASE_SSL = false;

  @IsString()
  @MinLength(32, { message: 'JWT_ACCESS_SECRET debe tener al menos 32 caracteres' })
  JWT_ACCESS_SECRET: string;

  @IsString()
  @MinLength(32, { message: 'JWT_REFRESH_SECRET debe tener al menos 32 caracteres' })
  JWT_REFRESH_SECRET: string;

  @IsString()
  @IsOptional()
  JWT_ACCESS_EXPIRES_IN = '15m';

  @IsString()
  @IsOptional()
  JWT_REFRESH_EXPIRES_IN = '30d';

  /**
   * Segundos durante los que un refresh token recién rotado todavía se
   * acepta como reintento legítimo (recarga que cortó la respuesta, pestaña
   * duplicada). Fuera de esa ventana, reusarlo es robo: se cierran todas las sesiones.
   */
  @Transform(({ value }) => (value === undefined || value === '' ? 10 : Number(value)))
  @IsInt()
  @Min(0)
  @Max(60)
  REFRESH_REUSE_GRACE_SECONDS = 10;

  @IsString()
  @IsOptional()
  FRONTEND_URL = 'http://localhost:4200';

  @IsIn(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
  @IsOptional()
  LOG_LEVEL = 'info';

  /**
   * Cloudinary (documentos PRIVADOS de verificación). Opcionales: sin las tres,
   * la subida responde 503 UPLOADS_NOT_CONFIGURED. El secret nunca llega al frontend.
   */
  @IsString()
  @IsOptional()
  CLOUDINARY_CLOUD_NAME?: string;

  @IsString()
  @IsOptional()
  CLOUDINARY_API_KEY?: string;

  @IsString()
  @IsOptional()
  CLOUDINARY_API_SECRET?: string;

  /** Solo pruebas locales contra un doble del proveedor. En producción, vacía. */
  @IsString()
  @IsOptional()
  CLOUDINARY_API_BASE?: string;

  /** Alternativa a las tres anteriores: cloudinary://<key>:<secret>@<cloud> (las sueltas tienen prioridad). */
  @IsString()
  @IsOptional()
  CLOUDINARY_URL?: string;

  /** Tiene que coincidir con Settings → Security → "Signature algorithm" de la cuenta. Default sha1. */
  @IsIn(['sha1', 'sha256', 'SHA1', 'SHA256'])
  @IsOptional()
  CLOUDINARY_SIGNATURE_ALGORITHM?: string;

  /**
   * Proveedor de direcciones (autocompletar, geocodificar y "Usar mi
   * ubicación"). `none` (default): la app funciona con dirección escrita a
   * mano + barrios. `google`: Places Autocomplete (New) + Geocoding con
   * `GOOGLE_MAPS_API_KEY` (restringila por API y por IP del backend). La key
   * nunca llega al frontend: todo pasa por `/location/*`.
   */
  @IsIn(['none', 'google'])
  @IsOptional()
  LOCATION_PROVIDER: 'none' | 'google' = 'none';

  @IsString()
  @IsOptional()
  GOOGLE_MAPS_API_KEY?: string;

  /**
   * Solicitudes distintas que un FREE puede presupuestar por mes de Argentina
   * (recibir y ver solicitudes nunca tiene tope). Default 10; 0 = sin límite.
   */
  @Transform(({ value }) => (value === undefined || value === '' ? 10 : Number(value)))
  @IsInt()
  @Min(0)
  FREE_MONTHLY_QUOTE_LIMIT = 10;

  /** Máximo de espacios "Destacado" (PRO) por búsqueda. 0 = sin destacados. */
  @Transform(({ value }) => (value === undefined || value === '' ? 2 : Number(value)))
  @IsInt()
  @Min(0)
  @Max(5)
  FEATURED_SLOTS = 2;

  /** Resultados necesarios por cada espacio destacado (el 2.º se abre recién con más volumen). */
  @Transform(({ value }) => (value === undefined || value === '' ? 8 : Number(value)))
  @IsInt()
  @Min(1)
  @Max(100)
  FEATURED_RESULTS_PER_SLOT = 8;

  /** Precio mensual de PRO en pesos (todavía sin cobro online). Default 19000. */
  @Transform(({ value }) => (value === undefined || value === '' ? 19000 : Number(value)))
  @IsInt()
  @Min(1)
  PRO_MONTHLY_PRICE_ARS = 19000;

  /**
   * Oferta de bienvenida de PRO (`plans/pro-offers.ts`): descuento en los
   * primeros meses para quien está en Free, llegó cerca del cupo y nunca pagó
   * PRO. Una sola vez por profesional. `false` la apaga en todos lados.
   */
  @Transform(({ value }) => (value === undefined || value === '' ? true : value === true || value === 'true'))
  @IsBoolean()
  PRO_INTRO_OFFER_ENABLED = true;

  /** Código estable de la oferta (se guarda en redenciones y eventos). */
  @Transform(({ value }) => (value === undefined || value === '' ? 'PRO_FIRST_MONTH_20' : value))
  @Matches(/^[A-Z0-9_]{3,40}$/, { message: 'PRO_INTRO_OFFER_CODE: mayúsculas, números y _ (3–40)' })
  PRO_INTRO_OFFER_CODE = 'PRO_FIRST_MONTH_20';

  @Transform(({ value }) => (value === undefined || value === '' ? 20 : Number(value)))
  @IsInt()
  @Min(1)
  @Max(90)
  PRO_INTRO_OFFER_DISCOUNT_PERCENT = 20;

  /** Meses con descuento (después, precio base). */
  @Transform(({ value }) => (value === undefined || value === '' ? 1 : Number(value)))
  @IsInt()
  @Min(1)
  @Max(12)
  PRO_INTRO_OFFER_CYCLES = 1;

  /** Presupuestos del mes desde los que se ofrece (se acota al cupo FREE). */
  @Transform(({ value }) => (value === undefined || value === '' ? 9 : Number(value)))
  @IsInt()
  @Min(1)
  PRO_INTRO_OFFER_MIN_FREE_USAGE = 9;

  /** Pedidos por minuto y por IP (global). */
  @Transform(({ value }) => (value === undefined || value === '' ? 120 : Number(value)))
  @IsInt()
  @Min(1)
  THROTTLE_LIMIT = 120;

  /**
   * SMTP (opcional). Sin `SMTP_HOST` el `EmailService` no envía nada (solo
   * loguea "requested"): dev sin proveedor configurado no rompe el registro,
   * pero el usuario no puede completar la verificación hasta configurarlo.
   * Pensado para cambiar a un proveedor transaccional (Resend, Postmark, SES,
   * Brevo…) sin tocar `AuthService` ni `EmailVerificationService`.
   */
  @IsString()
  @IsOptional()
  SMTP_HOST?: string;

  @Transform(({ value }) => (value === undefined || value === '' ? 465 : Number(value)))
  @IsInt()
  @Min(1)
  @Max(65535)
  SMTP_PORT = 465;

  @Transform(({ value }) => (value === undefined || value === '' ? true : value === true || value === 'true'))
  @IsBoolean()
  SMTP_SECURE = true;

  @IsString()
  @IsOptional()
  SMTP_USER?: string;

  /** App Password de Gmail (u otro proveedor SMTP), NUNCA la contraseña normal de la cuenta. */
  @IsString()
  @IsOptional()
  SMTP_PASS?: string;

  @IsString()
  @IsOptional()
  EMAIL_FROM = 'Resuelve <no-responder@resuelve.dev>';

  /** Minutos hasta que vence un código de verificación de email. */
  @Transform(({ value }) => (value === undefined || value === '' ? 10 : Number(value)))
  @IsInt()
  @Min(1)
  @Max(60)
  EMAIL_VERIFICATION_CODE_TTL_MINUTES = 10;

  /** Intentos fallidos permitidos por código antes de exigir un reenvío. */
  @Transform(({ value }) => (value === undefined || value === '' ? 5 : Number(value)))
  @IsInt()
  @Min(1)
  @Max(20)
  EMAIL_VERIFICATION_MAX_ATTEMPTS = 5;

  /** Segundos entre reenvíos consecutivos del código. */
  @Transform(({ value }) => (value === undefined || value === '' ? 60 : Number(value)))
  @IsInt()
  @Min(0)
  @Max(600)
  EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS = 60;

  /** Tope de envíos por cuenta en una hora (además del cooldown). */
  @Transform(({ value }) => (value === undefined || value === '' ? 5 : Number(value)))
  @IsInt()
  @Min(1)
  @Max(50)
  EMAIL_VERIFICATION_MAX_SENDS_PER_HOUR = 5;
}

export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const env = plainToInstance(EnvironmentVariables, config, { enableImplicitConversion: false });
  const errors = validateSync(env, { skipMissingProperties: false });
  if (errors.length) {
    const details = errors.flatMap((e) => Object.values(e.constraints ?? {})).join('\n  - ');
    throw new Error(`Configuración inválida:\n  - ${details}`);
  }
  if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
    throw new Error('Configuración inválida: JWT_ACCESS_SECRET y JWT_REFRESH_SECRET deben ser distintos');
  }
  return env;
}
