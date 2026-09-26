import { plainToInstance, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
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

  /** Pedidos por minuto y por IP (global). */
  @Transform(({ value }) => (value === undefined || value === '' ? 120 : Number(value)))
  @IsInt()
  @Min(1)
  THROTTLE_LIMIT = 120;
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
