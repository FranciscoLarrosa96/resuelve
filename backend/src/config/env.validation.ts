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

  @IsString()
  @IsOptional()
  FRONTEND_URL = 'http://localhost:4200';

  @IsIn(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
  @IsOptional()
  LOG_LEVEL = 'info';

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
