import { join } from 'path';
import type { DataSourceOptions } from 'typeorm';
import { SnakeNamingStrategy } from './snake-naming.strategy';

/**
 * Opciones compartidas por la app y por el CLI de migraciones.
 * `synchronize` está SIEMPRE apagado: el esquema solo cambia con migraciones.
 */
export function buildDataSourceOptions(env: {
  DATABASE_URL: string;
  DATABASE_SSL?: boolean | string;
}): DataSourceOptions {
  const ssl = env.DATABASE_SSL === true || env.DATABASE_SSL === 'true';
  return {
    type: 'postgres',
    url: env.DATABASE_URL,
    ssl: ssl ? { rejectUnauthorized: false } : false,
    namingStrategy: new SnakeNamingStrategy(),
    entities: [join(__dirname, '..', '**', '*.entity.{ts,js}')],
    migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
    migrationsTableName: 'typeorm_migrations',
    // gen_random_uuid() es nativo desde PostgreSQL 13: no requiere extensiones.
    uuidExtension: 'pgcrypto',
    synchronize: false,
    migrationsRun: false,
    logging: ['error', 'warn'],
  };
}
