import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { randomBytes, randomUUID } from 'crypto';
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
  /** Fotos de perfil en memoria (Cloudinary público, doble). */
  avatars: FakeAvatarStorage;
  /** Proveedor de direcciones controlable (por defecto sin configurar, como en producción sin key). */
  location: FakeLocationProvider;
  /** Transporte de mail en memoria: los tests nunca hablan con un SMTP real. */
  mail: FakeEmailSender;
}

/** Doble de `EmailSender`: guarda el último código por destinatario, nunca llama a un SMTP real. */
export class FakeEmailSender {
  readonly sent: { to: string; subject: string; text: string }[] = [];

  async send(message: { to: string; subject: string; html: string; text: string }): Promise<void> {
    this.sent.push({ to: message.to, subject: message.subject, text: message.text });
  }

  /** Último código de 6 dígitos enviado a ese email (lo "lee" del cuerpo del mensaje, como haría un usuario). */
  lastCodeFor(to: string): string {
    const match = [...this.sent].reverse().find((m) => m.to === to);
    const code = match?.text.match(/\b\d{6}\b/)?.[0];
    if (!code) throw new Error(`No se envió ningún código a ${to}`);
    return code;
  }
}

/** Marca `emailVerifiedAt` directo en la base: el helper de testing que pide la consigna, sin endpoint público. */
export async function verifyEmail(h: Harness, email: string): Promise<void> {
  await h.dataSource.query('UPDATE "users" SET "email_verified_at" = now() WHERE lower("email") = lower($1)', [
    email,
  ]);
}

/** Doble del almacenamiento público de avatares. */
export class FakeAvatarStorage {
  configured = true;
  readonly files = new Map<string, { format: string; bytes: number; version: number }>();
  readonly destroyed: string[] = [];

  createUploadTicket(folder: string) {
    const publicId = `${folder}/${randomUUID()}`;
    return {
      uploadUrl: 'https://fake.upload.test/image/upload',
      fields: {
        public_id: publicId,
        type: 'upload',
        timestamp: '1',
        allowed_formats: 'jpg,png,webp',
        api_key: 'k',
        signature: 's',
      },
      publicId,
      allowedFormats: ['jpg', 'png', 'webp'],
      maxBytes: 5 * 1024 * 1024,
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    };
  }
  upload(publicId: string, format = 'jpg', bytes = 80_000) {
    this.files.set(publicId, { format, bytes, version: 1_700_000_000 + this.files.size });
  }
  async inspect(publicId: string) {
    const f = this.files.get(publicId);
    return f ? { publicId, ...f } : null;
  }
  deliveryUrl(image: { publicId: string; version: number }) {
    return `https://res.fake.test/image/upload/c_fill,g_auto,w_256,h_256,q_auto,f_auto/v${image.version}/${image.publicId}`;
  }
  async destroy(publicId: string) {
    this.files.delete(publicId);
    this.destroyed.push(publicId);
  }
}

type FakePlace = {
  formattedAddress: string;
  street: string | null;
  number: string | null;
  neighbourhood: string | null;
  locality: string | null;
};

/** Doble del proveedor de direcciones: respuestas fijas y registro de lo consultado. */
export class FakeLocationProvider {
  configured = false;
  fail = false;
  place: FakePlace | null = null;
  suggestions: { id: string; main: string; secondary: string | null }[] = [];
  readonly calls: string[] = [];

  async autocomplete(query: string) {
    this.calls.push(`autocomplete:${query}`);
    if (this.fail) throw new Error('caído');
    return this.suggestions;
  }
  async geocode(input: { placeId?: string; address?: string }) {
    this.calls.push(`geocode:${input.placeId ?? input.address}`);
    if (this.fail) throw new Error('caído');
    return this.place;
  }
  async reverseGeocode(lat: number, lng: number) {
    this.calls.push(`reverse:${lat},${lng}`);
    if (this.fail) throw new Error('caído');
    return this.place;
  }
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
      fields: {
        public_id: publicId,
        type: 'private',
        timestamp: '1',
        allowed_formats: 'pdf,jpg,png,webp',
        api_key: 'k',
        signature: 's',
      },
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
    THROTTLE_ADMIN_LIMIT: '100000',
    THROTTLE_EVENTS_LIMIT: '100000',
    THROTTLE_LOCATION_LIMIT: '100000',
  });

  // Imports dinámicos: el módulo lee process.env al cargarse.
  const { AppModule } = await import('../src/app.module');
  const { configureApp } = await import('../src/app.setup');
  const { seedDatabase } = await import('../src/database/seeds/run-seed');
  const { DOCUMENT_STORAGE } = await import('../src/verifications/document-storage');
  const { AVATAR_STORAGE } = await import('../src/professionals/avatar/avatar-storage');
  const { LOCATION_PROVIDER } = await import('../src/location/location-provider');
  const { EMAIL_SENDER } = await import('../src/email/email-sender');

  const storage = new FakeDocumentStorage();
  const avatars = new FakeAvatarStorage();
  const location = new FakeLocationProvider();
  const mail = new FakeEmailSender();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(DOCUMENT_STORAGE)
    .useValue(storage)
    .overrideProvider(AVATAR_STORAGE)
    .useValue(avatars)
    .overrideProvider(LOCATION_PROVIDER)
    .useValue(location)
    .overrideProvider(EMAIL_SENDER)
    .useValue(mail)
    .compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
  configureApp(app);
  await app.init();

  const dataSource = app.get(DataSource);
  await dataSource.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await dataSource.runMigrations({ transaction: 'each' });
  await dataSource.transaction((m) => seedDatabase(m));

  return { app, http: request(app.getHttpServer()), dataSource, storage, avatars, location, mail };
}
