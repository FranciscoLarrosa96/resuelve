import { randomUUID } from 'crypto';
import { CloudinaryConfig, cloudinarySignature } from '../../common/cloudinary';

/**
 * Imágenes PÚBLICAS del profesional: foto de perfil y "Trabajos realizados"
 * (`work-photos/`), cada una en su carpeta. Separada a propósito del
 * almacenamiento PRIVADO de matrículas (`verifications/document-storage.ts`):
 * otra carpeta, recursos `type=upload` (se leen por URL pública) y solo imágenes.
 *
 * - El navegador sube directo a Cloudinary con una firma del backend que fija
 *   carpeta (`resuelve/avatars/<professionalProfileId>`, sin email ni teléfono),
 *   nombre aleatorio, formatos (JPG/PNG/WebP) y una transformación de entrada
 *   que re-codifica la imagen: el original guardado ya no tiene EXIF (GPS,
 *   cámara) y queda acotado a 1600 px.
 * - Al confirmar, el backend consulta al proveedor formato y peso REALES.
 * - Se persiste solo `publicId` + la URL de entrega: avatar 256×256 (recorte
 *   `c_fill` con `g_auto`) o trabajo hasta 1600 px (`c_limit`), ambos con
 *   `q_auto` y `f_auto`. Nunca el binario ni el original sin optimizar.
 */

export const AVATAR_STORAGE = Symbol('AVATAR_STORAGE');

export const ALLOWED_AVATAR_FORMATS = ['jpg', 'png', 'webp'] as const;
export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
export const AVATAR_SIZE = 256;
const AVATAR_TICKET_TTL_SECONDS = 60 * 60;
/** Transformación de entrada: re-codifica (sin metadata EXIF) y limita el tamaño del original. */
const INCOMING_TRANSFORMATION = 'c_limit,w_1600,h_1600';
/** Entregas: avatar cuadrado y foto de trabajo optimizada (nunca el original gigante). */
export const AVATAR_DELIVERY = `c_fill,g_auto,w_${AVATAR_SIZE},h_${AVATAR_SIZE},q_auto,f_auto`;
export const WORK_PHOTO_DELIVERY = 'c_limit,w_1600,h_1600,q_auto,f_auto';

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
  /** `maxBytes` solo informa al navegador (el peso real se valida al confirmar). */
  createUploadTicket(folder: string, maxBytes?: number): AvatarUploadTicket;
  inspect(publicId: string): Promise<StoredImage | null>;
  /** URL pública optimizada (por defecto, la del avatar: cuadrada 256×256). */
  deliveryUrl(image: Pick<StoredImage, 'publicId' | 'version'>, transformation?: string): string;
  destroy(publicId: string): Promise<void>;
}

export class CloudinaryAvatarStorage implements AvatarStorage {
  readonly configured: boolean;
  private readonly base: string;

  constructor(private readonly config: CloudinaryConfig & { deliveryBase?: string }) {
    this.configured = !!(config.cloudName && config.apiKey && config.apiSecret);
    this.base = (config.apiBase || 'https://api.cloudinary.com').replace(/\/$/, '');
  }

  createUploadTicket(folder: string, maxBytes = MAX_AVATAR_BYTES): AvatarUploadTicket {
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
        signature: cloudinarySignature(params, this.config.apiSecret!, this.config.signatureAlgorithm),
      },
      publicId,
      allowedFormats: ALLOWED_AVATAR_FORMATS,
      maxBytes,
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

  deliveryUrl(image: Pick<StoredImage, 'publicId' | 'version'>, transformation = AVATAR_DELIVERY): string {
    const base = (this.config.deliveryBase || 'https://res.cloudinary.com').replace(/\/$/, '');
    return `${base}/${this.config.cloudName}/image/upload/${transformation}/v${image.version}/${image.publicId}`;
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
        signature: cloudinarySignature(params, this.config.apiSecret!, this.config.signatureAlgorithm),
      }),
    });
    if (!res.ok) throw new Error(`Cloudinary respondió ${res.status} al borrar una foto`);
  }
}
