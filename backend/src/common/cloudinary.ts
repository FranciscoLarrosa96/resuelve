import { createHash } from 'crypto';

/** Firma de la API de Cloudinary: sha1("k1=v1&k2=v2…" ordenado + api_secret). */
export function cloudinarySignature(params: Record<string, string>, apiSecret: string): string {
  const payload = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');
  return createHash('sha1')
    .update(payload + apiSecret)
    .digest('hex');
}

export interface CloudinaryConfig {
  cloudName?: string;
  apiKey?: string;
  apiSecret?: string;
  /** Solo para pruebas locales contra un doble del proveedor. */
  apiBase?: string;
}
