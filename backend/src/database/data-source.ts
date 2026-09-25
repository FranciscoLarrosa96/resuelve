import 'reflect-metadata';
import { config } from 'dotenv';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from './typeorm.options';

/**
 * DataSource del CLI de TypeORM (migration:generate / run / revert).
 * Lee DATABASE_URL de las variables de entorno (o de `.env` en desarrollo).
 */
config({ quiet: true });

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL no está definida. Copiá .env.example a .env y completala.');
}

export default new DataSource(
  buildDataSourceOptions({ DATABASE_URL: process.env.DATABASE_URL, DATABASE_SSL: process.env.DATABASE_SSL }),
);
