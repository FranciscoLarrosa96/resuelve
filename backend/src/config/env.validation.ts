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

  @Transform(({ value }) => (value === undefined || value === '' ? true : value === true || value === 'true'))
  @IsBoolean()
  REFERRALS_ENABLED = true;

  @Transform(({ value }) => (value === undefined || value === '' ? true : value === true || value === 'true'))
  @IsBoolean()
  REFERRAL_REWARDS_ENABLED = true;

  @Transform(({ value }) => (value === undefined || value === '' ? 15 : Number(value)))
  @IsInt()
  @Min(1)
  @Max(30)
  REFERRAL_REWARD_DAYS = 15;

  /** Amigos que le suman días a quien invita (en total). El amigo siempre recibe lo suyo. */
  @Transform(({ value }) => (value === undefined || value === '' ? 3 : Number(value)))
  @IsInt()
  @Min(1)
  @Max(100)
  REFERRAL_MAX_REWARDS = 3;

  /** Ventana de acceso anticipado a oportunidades de discovery. */
  @Transform(({ value }) => (value === undefined || value === '' ? true : value === true || value === 'true'))
  @IsBoolean()
  PRO_EARLY_OPPORTUNITIES = true;

  /** Desactiva la persistencia y el registro de atribución comercial. */
  @Transform(({ value }) => (value === undefined || value === '' ? true : value === true || value === 'true'))
  @IsBoolean()
  PRO_ATTRIBUTION = true;

  @Transform(({ value }) => (value === undefined || value === '' ? 30 : Number(value)))
  @IsInt()
  @Min(0)
  @Max(1440)
  FREE_OPPORTUNITY_DELAY_MINUTES = 30;

  @Transform(({ value }) => (value === undefined || value === '' ? 30 : Number(value)))
  @IsInt()
  @Min(0)
  @Max(1440)
  URGENT_FREE_OPPORTUNITY_DELAY_MINUTES = 30;

  @Transform(({ value }) => (value === undefined || value === '' ? 3 : Number(value)))
  @IsInt()
  @Min(1)
  @Max(50)
  MAX_ACTIVE_QUOTES_PER_REQUEST = 5;

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

  /**
   * Compatibilidad con clientes del modelo de una sola ciudad (PWA vieja en caché): cuando un
   * pedido NO dice la localidad (perfil con "toda la ciudad" sin `coverage` ni localidad
   * principal; /location/* sin `localityId`), se usa esta ("provincia/localidad"). El
   * frontend multiciudad siempre la manda. Quitar en la fase "contract" (docs/multiciudad.md).
   */
  @IsOptional()
  @Matches(/^[a-z0-9-]+\/[a-z0-9-]+$/)
  LEGACY_LOCALITY = 'buenos-aires/tandil';

  /** Umbrales conservadores para referencias anónimas por servicio y ciudad. */
  @Transform(({ value }) => (value === undefined || value === '' ? 8 : Number(value)))
  @IsInt()
  @Min(8)
  PRO_BENCHMARK_MIN_PROFESSIONALS = 8;

  @Transform(({ value }) => (value === undefined || value === '' ? 20 : Number(value)))
  @IsInt()
  @Min(20)
  PRO_BENCHMARK_MIN_EVENTS = 20;

  @IsString()
  @IsOptional()
  GOOGLE_MAPS_API_KEY?: string;

  /** Oportunidades discovery distintas de Free post-trial, para siempre. 0 = sin límite. */
  @Transform(({ value }) => (value === undefined || value === '' ? 3 : Number(value)))
  @IsInt()
  @Min(0)
  FREE_QUOTE_LIMIT = 3;

  /** @deprecated Usar FREE_QUOTE_LIMIT; este nombre se conserva como fallback de migración. */
  @Transform(({ value }) => (value === undefined || value === '' ? undefined : Number(value)))
  @IsOptional()
  @IsInt()
  @Min(0)
  FREE_MONTHLY_QUOTE_LIMIT?: number;

  /** Trial de activación hasta el primer presupuesto aceptado. */
  @Transform(({ value }) => (value === undefined || value === '' ? true : value === true || value === 'true'))
  @IsBoolean()
  FIRST_SUCCESS_TRIAL_ENABLED = true;

  /** Safety valves preparadas, sin límite mientras queden vacías. */
  @Transform(({ value }) => (value === undefined || value === '' ? undefined : Number(value)))
  @IsOptional()
  @IsInt()
  @Min(1)
  FIRST_SUCCESS_TRIAL_MAX_DAYS?: number;

  @Transform(({ value }) => (value === undefined || value === '' ? undefined : Number(value)))
  @IsOptional()
  @IsInt()
  @Min(1)
  FIRST_SUCCESS_TRIAL_MAX_OPPORTUNITIES?: number;

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

  /** Precio mensual de PRO en pesos (lo cobra Mercado Pago con billing activo). Default 15000. */
  @Transform(({ value }) => (value === undefined || value === '' ? 15000 : Number(value)))
  @IsInt()
  @Min(1)
  PRO_MONTHLY_PRICE_ARS = 15000;

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

  /** Oportunidades Free totales desde las que se ofrece (se acota al cupo). */
  @Transform(({ value }) => (value === undefined || value === '' ? 9 : Number(value)))
  @IsInt()
  @Min(1)
  PRO_INTRO_OFFER_MIN_FREE_USAGE = 9;

  /**
   * Billing de PRO (`billing/`). `none` (default): no se contrata online
   * (GET /plans → `selfServe: false`). `mercadopago`: suscripciones reales
   * (exige MP_ACCESS_TOKEN, MP_WEBHOOK_SECRET y MP_BACK_URL). `fake`: doble
   * en memoria con checkout falso, solo fuera de producción (dev/Playwright).
   */
  @IsIn(['none', 'mercadopago', 'fake'])
  @IsOptional()
  BILLING_PROVIDER: 'none' | 'mercadopago' | 'fake' = 'none';

  /** Credenciales de prueba (`test`) o reales (`prod`). `prod` solo con NODE_ENV=production. */
  @IsIn(['test', 'prod'])
  @IsOptional()
  MP_ENV: 'test' | 'prod' = 'test';

  /** Access Token de la aplicación de Mercado Pago. Solo backend: nunca llega al frontend ni a los logs. */
  @IsString()
  @IsOptional()
  MP_ACCESS_TOKEN?: string;

  /** Clave secreta de Webhooks (Tus integraciones → Webhooks) para validar `x-signature`. */
  @IsString()
  @IsOptional()
  MP_WEBHOOK_SECRET?: string;

  /** Adónde vuelve Mercado Pago tras autorizar: `<frontend>/pro/plan/resultado`. */
  @IsString()
  @IsOptional()
  MP_BACK_URL?: string;

  /** Solo con MP_ENV=test: email del comprador de prueba (MP exige que coincida con la cuenta de test). */
  @IsString()
  @IsOptional()
  MP_TEST_PAYER_EMAIL?: string;

  /** Solo pruebas locales contra un doble de la API. En producción, vacía. */
  @IsString()
  @IsOptional()
  MP_API_BASE?: string;

  /** Timeout de cada llamada a Mercado Pago (ms). */
  @Transform(({ value }) => (value === undefined || value === '' ? 10000 : Number(value)))
  @IsInt()
  @Min(1000)
  @Max(60000)
  MP_TIMEOUT_MS = 10000;

  @IsIn(['ARS'])
  @IsOptional()
  MP_CURRENCY = 'ARS';

  /** Días con PRO después de un cobro rechazado mientras MP reintenta (PAST_DUE). */
  @Transform(({ value }) => (value === undefined || value === '' ? 10 : Number(value)))
  @IsInt()
  @Min(0)
  @Max(30)
  BILLING_GRACE_DAYS = 10;

  /** Días corridos para arrepentirse de la contratación de PRO (la ley fija 10 como mínimo). */
  @Transform(({ value }) => (value === undefined || value === '' ? 10 : Number(value)))
  @IsInt()
  @Min(10)
  @Max(30)
  BILLING_WITHDRAWAL_DAYS = 10;

  /** Cada cuánto se reconcilian solas las suscripciones no terminales (min). 0 = apagado. */
  @Transform(({ value }) => (value === undefined || value === '' ? 60 : Number(value)))
  @IsInt()
  @Min(0)
  @Max(1440)
  BILLING_RECONCILE_INTERVAL_MINUTES = 60;

  /** Horas que se reutiliza un checkout PENDING antes de reemplazarlo. */
  @Transform(({ value }) => (value === undefined || value === '' ? 24 : Number(value)))
  @IsInt()
  @Min(1)
  @Max(720)
  BILLING_PENDING_TTL_HOURS = 24;

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

  /**
   * API key de Resend (HTTPS, sin SMTP: anda en Render Free). Si está, tiene
   * prioridad sobre `SMTP_HOST`. `EMAIL_FROM` debe ser de un dominio verificado.
   */
  @IsString()
  @IsOptional()
  RESEND_API_KEY?: string;

  @IsString()
  @IsOptional()
  EMAIL_FROM ='Resuelve <no-responder@resuelve.dev>';

  /**
   * Avisos por email de la actividad (nueva solicitud, presupuesto, horario…).
   * Apagado por defecto. Necesita `SMTP_HOST` (Render Free bloquea SMTP). Cada
   * persona puede darse de baja; nunca se mandan avisos de antes de activarlo.
   */
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  EMAIL_NOTIFICATIONS_ENABLED = false;

  /** Cada cuántos segundos el job revisa avisos pendientes. */
  @Transform(({ value }) => (value === undefined || value === '' ? 60 : Number(value)))
  @IsInt()
  @Min(15)
  @Max(3600)
  EMAIL_NOTIFICATIONS_INTERVAL_SECONDS = 60;

  /** Tope de avisos enviados en 24 h entre todos (Gmail personal ronda los 500 destinatarios por día). */
  @Transform(({ value }) => (value === undefined || value === '' ? 400 : Number(value)))
  @IsInt()
  @Min(1)
  @Max(100000)
  EMAIL_NOTIFICATIONS_DAILY_LIMIT = 400;

  /** Tope de avisos por persona en 24 h; el resto queda solo en la app. */
  @Transform(({ value }) => (value === undefined || value === '' ? 12 : Number(value)))
  @IsInt()
  @Min(1)
  @Max(200)
  EMAIL_NOTIFICATIONS_MAX_PER_USER_DAY = 12;

  /**
   * Avisos push (Web Push estándar, sin Firebase). Apagado por defecto; con
   * `true` necesita las claves VAPID (`npm run push:keys`). Nunca se mandan
   * avisos de antes de activarlo.
   */
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  PUSH_NOTIFICATIONS_ENABLED = false;

  /** Clave pública VAPID (base64url). Es pública: viaja al navegador para suscribirse. */
  @IsString()
  @IsOptional()
  VAPID_PUBLIC_KEY?: string;

  /** Clave privada VAPID (base64url). Secreta: solo en el servidor. */
  @IsString()
  @IsOptional()
  VAPID_PRIVATE_KEY?: string;

  /** Contacto para los servicios de push: `mailto:…` o la URL del sitio. */
  @IsString()
  @IsOptional()
  VAPID_SUBJECT?: string;

  /** Horario de silencio de Argentina: de esta hora… (0–23; igual a la de fin = sin silencio). */
  @Transform(({ value }) => (value === undefined || value === '' ? 23 : Number(value)))
  @IsInt()
  @Min(0)
  @Max(23)
  PUSH_QUIET_START_HOUR = 23;

  /** …hasta esta hora los push esperan y salen juntos. */
  @Transform(({ value }) => (value === undefined || value === '' ? 8 : Number(value)))
  @IsInt()
  @Min(0)
  @Max(23)
  PUSH_QUIET_END_HOUR = 8;

  /**
   * Verificación de email por código. Apagada (default): el registro crea la
   * cuenta directo y no se exige email verificado para nada. Encendida exige
   * un SMTP que funcione (Render Free bloquea los puertos SMTP).
   */
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  EMAIL_VERIFICATION_ENABLED = false;

  /** Minutos hasta que vence un código de verificación de email. */
  @Transform(({ value }) => (value === undefined || value === '' ? 10 : Number(value)))
  @IsInt()
  @Min(1)
  @Max(60)
  EMAIL_VERIFICATION_CODE_TTL_MINUTES = 10;

  /** Intentos fallidos permitidos por código antes de exigir un reenvío. */
  @Transform(({ value }) => (value === undefined || value === '' ? 3 : Number(value)))
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
  @Transform(({ value }) => (value === undefined || value === '' ? 3 : Number(value)))
  @IsInt()
  @Min(1)
  @Max(50)
  EMAIL_VERIFICATION_MAX_SENDS_PER_HOUR = 5;

  /**
   * Horas hasta que vence un registro pendiente completo (no solo el código:
   * pasado esto hay que volver a registrarse desde cero). Configurable.
   */
  @Transform(({ value }) => (value === undefined || value === '' ? 24 : Number(value)))
  @IsInt()
  @Min(1)
  @Max(168)
  PENDING_REGISTRATION_TTL_HOURS = 24;
}

export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const env = plainToInstance(EnvironmentVariables, config, { enableImplicitConversion: false });
  // class-transformer skips transforms for omitted keys, so apply the legacy
  // fallback explicitly before validation while deployments rename the env.
  if (
    (config.FREE_QUOTE_LIMIT === undefined || config.FREE_QUOTE_LIMIT === '') &&
    config.FREE_MONTHLY_QUOTE_LIMIT !== undefined &&
    config.FREE_MONTHLY_QUOTE_LIMIT !== ''
  ) {
    env.FREE_QUOTE_LIMIT = Number(config.FREE_MONTHLY_QUOTE_LIMIT);
  }
  const errors = validateSync(env, { skipMissingProperties: false });
  if (errors.length) {
    const details = errors.flatMap((e) => Object.values(e.constraints ?? {})).join('\n  - ');
    throw new Error(`Configuración inválida:\n  - ${details}`);
  }
  if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
    throw new Error('Configuración inválida: JWT_ACCESS_SECRET y JWT_REFRESH_SECRET deben ser distintos');
  }
  const billingError = billingConfigError(env);
  if (billingError) throw new Error(`Configuración inválida: ${billingError}`);
  return env;
}

/**
 * Coherencia del billing: credenciales completas, nunca Mercado Pago real en
 * tests automáticos, nunca credenciales productivas fuera de producción y
 * nunca el proveedor falso en producción.
 */
export function billingConfigError(
  env: Pick<
    EnvironmentVariables,
    'NODE_ENV' | 'BILLING_PROVIDER' | 'MP_ENV' | 'MP_ACCESS_TOKEN' | 'MP_WEBHOOK_SECRET' | 'MP_BACK_URL'
  >,
): string | null {
  if (env.BILLING_PROVIDER === 'fake' && env.NODE_ENV === 'production') {
    return 'BILLING_PROVIDER=fake no se permite en producción';
  }
  if (env.BILLING_PROVIDER !== 'mercadopago') return null;
  if (env.NODE_ENV === 'test')
    return 'los tests automáticos no pueden usar Mercado Pago real (BILLING_PROVIDER=fake)';
  if (env.MP_ENV === 'prod' && env.NODE_ENV !== 'production') {
    return 'MP_ENV=prod (credenciales reales) solo con NODE_ENV=production';
  }
  const missing = (['MP_ACCESS_TOKEN', 'MP_WEBHOOK_SECRET', 'MP_BACK_URL'] as const).filter(
    (k) => !env[k]?.trim(),
  );
  if (missing.length) return `BILLING_PROVIDER=mercadopago exige ${missing.join(', ')}`;
  try {
    const url = new URL(env.MP_BACK_URL!);
    if (url.protocol !== 'https:' && env.NODE_ENV === 'production') return 'MP_BACK_URL tiene que ser https';
  } catch {
    return 'MP_BACK_URL no es una URL válida';
  }
  return null;
}
