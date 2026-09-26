import { createHash, randomUUID } from 'crypto';

/**
 * Almacenamiento PRIVADO de documentos de verificación (matrícula).
 *
 * - El archivo nunca pasa por la API ni por Postgres: el navegador lo sube
 *   directo al proveedor con una firma temporal que arma el backend.
 * - La firma fija carpeta, nombre (public_id), tipo privado y formatos.
 * - Al confirmar, el backend consulta al proveedor el formato y el peso REALES
 *   (no confía en la extensión ni en lo que diga el navegador).
 * - Solo se persiste el `publicId`. Las URLs de lectura son firmadas, vencen
 *   rápido y se generan solo para la revisión (CLI).
 */

export const DOCUMENT_STORAGE = Symbol('DOCUMENT_STORAGE');

/** PDF, JPG/JPEG (Cloudinary lo informa como "jpg"), PNG y WebP. */
export const ALLOWED_DOCUMENT_FORMATS = ['pdf', 'jpg', 'png', 'webp'] as const;
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
/** Lo que dura la firma de subida (Cloudinary rechaza timestamps de más de 1 h). */
export const UPLOAD_TICKET_TTL_SECONDS = 60 * 60;

/** Carpeta por profesional: solo su id interno (nunca email, DNI ni teléfono). */
export function verificationFolder(professionalId: string): string {
  return `resuelve/verifications/${professionalId}`;
}

export interface UploadTicket {
  /** POST multipart al proveedor con `file` + `fields`. */
  uploadUrl: string;
  fields: Record<string, string>;
  publicId: string;
  allowedFormats: readonly string[];
  maxBytes: number;
  expiresAt: string;
}

export interface StoredDocument {
  publicId: string;
  format: string;
  bytes: number;
}

export interface DocumentStorage {
  /** false = faltan credenciales: las subidas responden 503 UPLOADS_NOT_CONFIGURED. */
  readonly configured: boolean;
  createUploadTicket(folder: string): UploadTicket;
  /** Metadata real del archivo subido (null si no existe). */
  inspect(publicId: string): Promise<StoredDocument | null>;
  /** URL firmada y temporal para que un revisor vea el archivo. No se persiste ni se loguea. */
  signedDownloadUrl(doc: Pick<StoredDocument, 'publicId' | 'format'>, ttlSeconds: number): string;
  destroy(publicId: string): Promise<void>;
}

export interface CloudinaryConfig {
  cloudName?: string;
  apiKey?: string;
  apiSecret?: string;
  /** Solo para pruebas locales contra un doble del proveedor. */
  apiBase?: string;
}

/**
 * Cloudinary vía API REST firmada (sin SDK): recursos `type=private`, que no
 * se pueden leer por URL pública.
 */
export class CloudinaryDocumentStorage implements DocumentStorage {
  readonly configured: boolean;
  private readonly base: string;

  constructor(private readonly config: CloudinaryConfig) {
    this.configured = !!(config.cloudName && config.apiKey && config.apiSecret);
    this.base = (config.apiBase || 'https://api.cloudinary.com').replace(/\/$/, '');
  }

  createUploadTicket(folder: string): UploadTicket {
    const now = Math.floor(Date.now() / 1000);
    const publicId = `${folder}/${randomUUID()}`;
    const params: Record<string, string> = {
      allowed_formats: ALLOWED_DOCUMENT_FORMATS.join(','),
      public_id: publicId,
      timestamp: String(now),
      type: 'private',
    };
    return {
      // "image" admite PDF en Cloudinary; así todo documento tiene el mismo resource_type.
      uploadUrl: `${this.base}/v1_1/${this.config.cloudName}/image/upload`,
      fields: { ...params, api_key: this.config.apiKey!, signature: this.sign(params) },
      publicId,
      allowedFormats: ALLOWED_DOCUMENT_FORMATS,
      maxBytes: MAX_DOCUMENT_BYTES,
      expiresAt: new Date((now + UPLOAD_TICKET_TTL_SECONDS) * 1000).toISOString(),
    };
  }

  async inspect(publicId: string): Promise<StoredDocument | null> {
    const res = await fetch(
      `${this.base}/v1_1/${this.config.cloudName}/resources/image/private/${publicId
        .split('/')
        .map(encodeURIComponent)
        .join('/')}`,
      { headers: { Authorization: `Basic ${Buffer.from(`${this.config.apiKey}:${this.config.apiSecret}`).toString('base64')}` } },
    );
    if (res.status === 404) return null;
    // Sin la URL en el mensaje: no se filtra nada a los logs.
    if (!res.ok) throw new Error(`Cloudinary respondió ${res.status} al inspeccionar un documento`);
    const body = (await res.json()) as { public_id: string; format: string; bytes: number };
    return { publicId: body.public_id, format: String(body.format).toLowerCase(), bytes: Number(body.bytes) };
  }

  signedDownloadUrl(doc: Pick<StoredDocument, 'publicId' | 'format'>, ttlSeconds: number): string {
    const now = Math.floor(Date.now() / 1000);
    const params: Record<string, string> = {
      expires_at: String(now + ttlSeconds),
      format: doc.format,
      public_id: doc.publicId,
      timestamp: String(now),
      type: 'private',
    };
    const query = new URLSearchParams({ ...params, api_key: this.config.apiKey!, signature: this.sign(params) });
    return `${this.base}/v1_1/${this.config.cloudName}/image/download?${query.toString()}`;
  }

  async destroy(publicId: string): Promise<void> {
    const params: Record<string, string> = {
      invalidate: 'true',
      public_id: publicId,
      timestamp: String(Math.floor(Date.now() / 1000)),
      type: 'private',
    };
    const res = await fetch(`${this.base}/v1_1/${this.config.cloudName}/image/destroy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ ...params, api_key: this.config.apiKey!, signature: this.sign(params) }),
    });
    if (!res.ok) throw new Error(`Cloudinary respondió ${res.status} al borrar un documento`);
  }

  /** Firma de Cloudinary: sha1("k1=v1&k2=v2…" ordenado + api_secret). */
  sign(params: Record<string, string>): string {
    const payload = Object.keys(params)
      .sort()
      .map((k) => `${k}=${params[k]}`)
      .join('&');
    return createHash('sha1').update(payload + this.config.apiSecret).digest('hex');
  }
}
