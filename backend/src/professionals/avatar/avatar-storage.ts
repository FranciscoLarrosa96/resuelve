import { randomUUID } from 'crypto';
import { CloudinaryConfig, cloudinarySignature } from '../../common/cloudinary';

/**
 * Foto de perfil PÚBLICA del profesional. Separada a propósito del
 * almacenamiento PRIVADO de matrículas (`verifications/document-storage.ts`):
 * otra carpeta, recursos `type=upload` (se leen por URL pública) y solo imágenes.
 *
 * - El navegador sube directo a Cloudinary con una firma del backend que fija
 *   carpeta (`resuelve/avatars/<professionalProfileId>`, sin email ni teléfono),
 *   nombre aleatorio, formatos (JPG/PNG/WebP) y una transformación de entrada
 *   que re-codifica la imagen: el original guardado ya no tiene EXIF (GPS,
 *   cámara) y queda acotado a 1600 px.
 * - Al confirmar, el backend consulta al proveedor formato y peso REALES.
 * - Se persiste solo `publicId` + la URL de entrega (256×256, recorte
 *   `c_fill` con `g_auto`, `q_auto`, `f_auto`). Nunca el binario.
 */

export const AVATAR_STORAGE = Symbol('AVATAR_STORAGE');

export const ALLOWED_AVATAR_FORMATS = ['jpg', 'png', 'webp'] as const;
export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
export const AVATAR_SIZE = 256;
const AVATAR_TICKET_TTL_SECONDS = 60 * 60;
/** Transformación de entrada: re-codifica (sin metadata EXIF) y limita el tamaño del original. */
const INCOMING_TRANSFORMATION = 'c_limit,w_1600,h_1600';

export function avatarFolder(professionalId: string): string {
  return `resuelve/avatars/${professionalId}`;
}

export interface AvatarUploadTicket {
  uploadUrl: string;
  fields: Record<string, string>;
  publicId: string;
  allowedFormats: readonly string[];
  maxBytes: number;
  expiresAt: string;
}

export interface StoredImage {
  publicId: string;
  format: string;
  bytes: number;
  version: number;
}

export interface AvatarStorage {
  /** false = faltan credenciales: responde 503 UPLOADS_NOT_CONFIGURED. */
  readonly configured: boolean;
  createUploadTicket(folder: string): AvatarUploadTicket;
  inspect(publicId: string): Promise<StoredImage | null>;
  /** URL pública cuadrada que se muestra en perfiles, listados y presupuestos. */
  deliveryUrl(image: Pick<StoredImage, 'publicId' | 'version'>): string;
  destroy(publicId: string): Promise<void>;
}

export class CloudinaryAvatarStorage implements AvatarStorage {
  readonly configured: boolean;
  private readonly base: string;

  constructor(private readonly config: CloudinaryConfig & { deliveryBase?: string }) {
    this.configured = !!(config.cloudName && config.apiKey && config.apiSecret);
    this.base = (config.apiBase || 'https://api.cloudinary.com').replace(/\/$/, '');
  }

  createUploadTicket(folder: string): AvatarUploadTicket {
    const now = Math.floor(Date.now() / 1000);
    const publicId = `${folder}/${randomUUID()}`;
    const params: Record<string, string> = {
      allowed_formats: ALLOWED_AVATAR_FORMATS.join(','),
      overwrite: 'false',
      public_id: publicId,
      timestamp: String(now),
      transformation: INCOMING_TRANSFORMATION,
      type: 'upload',
    };
    return {
      uploadUrl: `${this.base}/v1_1/${this.config.cloudName}/image/upload`,
      fields: {
        ...params,
        api_key: this.config.apiKey!,
        signature: cloudinarySignature(params, this.config.apiSecret!),
      },
      publicId,
      allowedFormats: ALLOWED_AVATAR_FORMATS,
      maxBytes: MAX_AVATAR_BYTES,
      expiresAt: new Date((now + AVATAR_TICKET_TTL_SECONDS) * 1000).toISOString(),
    };
  }

  async inspect(publicId: string): Promise<StoredImage | null> {
    const path = publicId.split('/').map(encodeURIComponent).join('/');
    const res = await fetch(`${this.base}/v1_1/${this.config.cloudName}/resources/image/upload/${path}`, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.config.apiKey}:${this.config.apiSecret}`).toString('base64')}`,
      },
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Cloudinary respondió ${res.status} al inspeccionar una foto`);
    const body = (await res.json()) as { public_id: string; format: string; bytes: number; version: number };
    return {
      publicId: body.public_id,
      format: String(body.format).toLowerCase(),
      bytes: Number(body.bytes),
      version: Number(body.version),
    };
  }

  deliveryUrl(image: Pick<StoredImage, 'publicId' | 'version'>): string {
    const base = (this.config.deliveryBase || 'https://res.cloudinary.com').replace(/\/$/, '');
    const t = `c_fill,g_auto,w_${AVATAR_SIZE},h_${AVATAR_SIZE},q_auto,f_auto`;
    return `${base}/${this.config.cloudName}/image/upload/${t}/v${image.version}/${image.publicId}`;
  }

  async destroy(publicId: string): Promise<void> {
    const params: Record<string, string> = {
      invalidate: 'true',
      public_id: publicId,
      timestamp: String(Math.floor(Date.now() / 1000)),
      type: 'upload',
    };
    const res = await fetch(`${this.base}/v1_1/${this.config.cloudName}/image/destroy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        ...params,
        api_key: this.config.apiKey!,
        signature: cloudinarySignature(params, this.config.apiSecret!),
      }),
    });
    if (!res.ok) throw new Error(`Cloudinary respondió ${res.status} al borrar una foto`);
  }
}
