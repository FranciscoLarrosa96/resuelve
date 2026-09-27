import { createHash } from 'crypto';

export type CloudinarySignatureAlgorithm = 'sha1' | 'sha256';

/**
 * Firma de la API de Cloudinary: hash("k1=v1&k2=v2…" ordenado + api_secret).
 * SHA-1 por defecto; SHA-256 si la cuenta lo tiene configurado
 * (Settings → Security → "Signature algorithm"). Tienen que coincidir.
 */
export function cloudinarySignature(
  params: Record<string, string>,
  apiSecret: string,
  algorithm: CloudinarySignatureAlgorithm = 'sha1',
): string {
  const payload = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');
  return createHash(algorithm)
    .update(payload + apiSecret)
    .digest('hex');
}

export interface CloudinaryConfig {
  cloudName?: string;
  apiKey?: string;
  apiSecret?: string;
  /** Solo para pruebas locales contra un doble del proveedor. */
  apiBase?: string;
  signatureAlgorithm?: CloudinarySignatureAlgorithm;
}

/**
 * Valor de env pegado desde el panel: sin espacios, saltos de línea ni
 * comillas alrededor. Un espacio al final del secret alcanza para que
 * Cloudinary responda "Invalid Signature" con el mismo "String to sign".
 */
export function cleanEnvValue(value: string | undefined): string | undefined {
  const v = value
    ?.trim()
    .replace(/^(['"])(.*)\1$/, '$2')
    .trim();
  return v ? v : undefined;
}

/**
 * Credenciales desde `CLOUDINARY_CLOUD_NAME` / `_API_KEY` / `_API_SECRET` o,
 * si faltan, desde `CLOUDINARY_URL` (cloudinary://<key>:<secret>@<cloud>, el
 * formato que muestra el panel). Las variables sueltas tienen prioridad.
 */
export function readCloudinaryConfig(get: (key: string) => string | undefined): CloudinaryConfig {
  let fromUrl: Pick<CloudinaryConfig, 'cloudName' | 'apiKey' | 'apiSecret'> = {};
  const url = cleanEnvValue(get('CLOUDINARY_URL'));
  if (url) {
    try {
      const u = new URL(url);
      if (u.protocol === 'cloudinary:')
        fromUrl = {
          cloudName: cleanEnvValue(u.hostname),
          apiKey: cleanEnvValue(decodeURIComponent(u.username)),
          apiSecret: cleanEnvValue(decodeURIComponent(u.password)),
        };
    } catch {
      /* URL inválida: se ignora (las variables sueltas siguen valiendo) */
    }
  }
  const algorithm = cleanEnvValue(get('CLOUDINARY_SIGNATURE_ALGORITHM'))?.toLowerCase();
  return {
    cloudName: cleanEnvValue(get('CLOUDINARY_CLOUD_NAME')) ?? fromUrl.cloudName,
    apiKey: cleanEnvValue(get('CLOUDINARY_API_KEY')) ?? fromUrl.apiKey,
    apiSecret: cleanEnvValue(get('CLOUDINARY_API_SECRET')) ?? fromUrl.apiSecret,
    apiBase: cleanEnvValue(get('CLOUDINARY_API_BASE')),
    signatureAlgorithm: algorithm === 'sha256' ? 'sha256' : 'sha1',
  };
}
