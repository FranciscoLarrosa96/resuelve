import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { randomBytes } from 'crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';

/**
 * Levanta la API completa contra una base PostgreSQL real y descartable
 * (TEST_DATABASE_URL): borra el esquema, corre las migraciones y el seed.
 * Sin TEST_DATABASE_URL los tests e2e se saltean (no se inventa una base).
 */
export const TEST_DB_URL = process.env.TEST_DATABASE_URL;
export const describeE2E = TEST_DB_URL ? describe : describe.skip;

export interface Harness {
  app: NestExpressApplication;
  http: ReturnType<typeof request>;
  dataSource: DataSource;
  /** Almacenamiento de documentos en memoria: los tests nunca llaman a Cloudinary. */
  storage: FakeDocumentStorage;
}

/**
 * Doble del almacenamiento privado. `upload()` simula lo que haría el
 * navegador con la firma; `inspect()` devuelve el formato/peso "reales".
 */
export class FakeDocumentStorage {
  configured = true;
  readonly files = new Map<string, { format: string; bytes: number }>();
  readonly destroyed: string[] = [];

  createUploadTicket(folder: string) {
    const publicId = `${folder}/${randomBytes(8).toString('hex')}`;
    return {
      uploadUrl: 'https://fake.upload.test/image/upload',
      fields: { public_id: publicId, type: 'private', timestamp: '1', allowed_formats: 'pdf,jpg,png,webp', api_key: 'k', signature: 's' },
      publicId,
      allowedFormats: ['pdf', 'jpg', 'png', 'webp'],
      maxBytes: 10 * 1024 * 1024,
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    };
  }
  upload(publicId: string, format = 'pdf', bytes = 120_000) {
    this.files.set(publicId, { format, bytes });
  }
  async inspect(publicId: string) {
    const f = this.files.get(publicId);
    return f ? { publicId, ...f } : null;
  }
  signedDownloadUrl(doc: { publicId: string }) {
    return `https://fake.upload.test/download/${doc.publicId}?signature=temporal`;
  }
  async destroy(publicId: string) {
    this.files.delete(publicId);
    this.destroyed.push(publicId);
  }
}

export async function startApp(): Promise<Harness> {
  Object.assign(process.env, {
    NODE_ENV: 'test',
    DATABASE_URL: TEST_DB_URL,
    DATABASE_SSL: 'false',
    JWT_ACCESS_SECRET: randomBytes(32).toString('hex'),
    JWT_REFRESH_SECRET: randomBytes(32).toString('hex'),
    JWT_ACCESS_EXPIRES_IN: '15m',
    JWT_REFRESH_EXPIRES_IN: '30d',
    FRONTEND_URL: 'http://localhost:4200',
    LOG_LEVEL: 'silent',
    THROTTLE_LIMIT: '100000',
    THROTTLE_AUTH_LIMIT: '100000',
    THROTTLE_VERIFICATION_LIMIT: '100000',
  });

  // Imports dinámicos: el módulo lee process.env al cargarse.
  const { AppModule } = await import('../src/app.module');
  const { configureApp } = await import('../src/app.setup');
  const { seedDatabase } = await import('../src/database/seeds/run-seed');
  const { DOCUMENT_STORAGE } = await import('../src/verifications/document-storage');

  const storage = new FakeDocumentStorage();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(DOCUMENT_STORAGE)
    .useValue(storage)
    .compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
  configureApp(app);
  await app.init();

  const dataSource = app.get(DataSource);
  await dataSource.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await dataSource.runMigrations({ transaction: 'each' });
  await dataSource.transaction((m) => seedDatabase(m));

  return { app, http: request(app.getHttpServer()), dataSource, storage };
}
