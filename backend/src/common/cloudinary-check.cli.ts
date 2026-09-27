import 'dotenv/config';
import { CloudinarySignatureAlgorithm, cloudinarySignature, readCloudinaryConfig } from './cloudinary';

/**
 * `npm run cloudinary:check`: diagnostica las credenciales de Cloudinary SIN
 * imprimirlas. Sirve para "Invalid Signature" al subir fotos o matrículas.
 *
 * 1. Credenciales: el Admin API (`/ping`, Basic auth key:secret) dice si el
 *    par key/secret es de esa cuenta.
 * 2. Firma: sube una imagen de 1×1 px firmada con SHA-1 y con SHA-256 (carpeta
 *    `resuelve/healthcheck`) y la borra. Indica qué algoritmo acepta la cuenta
 *    (`CLOUDINARY_SIGNATURE_ALGORITHM`).
 */
const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

async function main(): Promise<void> {
  const raw = (k: string) => process.env[k];
  const c = readCloudinaryConfig(raw);
  const base = (c.apiBase || 'https://api.cloudinary.com').replace(/\/$/, '');
  const mask = (v?: string) => (v ? `${v.slice(0, 3)}…${v.slice(-2)} (${v.length} caracteres)` : 'FALTA');
  const dirty = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'].filter((k) => {
    const v = raw(k);
    return v !== undefined && v !== v.trim();
  });
  console.log(`Cloud name: ${c.cloudName ?? 'FALTA'}`);
  console.log(`API key:    ${mask(c.apiKey)}`);
  console.log(`API secret: ${mask(c.apiSecret)}`);
  console.log(`Algoritmo configurado: ${c.signatureAlgorithm}`);
  if (dirty.length)
    console.log(`Aviso: ${dirty.join(', ')} tenía espacios o saltos de línea (se limpian solos).`);
  if (!c.cloudName || !c.apiKey || !c.apiSecret) {
    console.log(
      '\nFaltan credenciales: definí CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY y CLOUDINARY_API_SECRET (o CLOUDINARY_URL).',
    );
    process.exitCode = 1;
    return;
  }

  const auth = `Basic ${Buffer.from(`${c.apiKey}:${c.apiSecret}`).toString('base64')}`;
  const ping = await fetch(`${base}/v1_1/${c.cloudName}/ping`, { headers: { Authorization: auth } });
  if (ping.ok) console.log('\n✓ Credenciales válidas para esa cuenta (Admin API).');
  else {
    console.log(`\n✗ Credenciales rechazadas por el Admin API (${ping.status}).`);
    console.log(
      '  Revisá que CLOUDINARY_API_SECRET sea el secret de ESA API key (en el panel: API Keys → ojo de "API Secret").',
    );
    process.exitCode = 1;
    return;
  }

  const works: CloudinarySignatureAlgorithm[] = [];
  for (const algorithm of ['sha1', 'sha256'] as const) {
    const params = {
      public_id: `resuelve/healthcheck/check-${Date.now()}-${algorithm}`,
      timestamp: String(Math.floor(Date.now() / 1000)),
    };
    const body = new URLSearchParams({
      ...params,
      file: PIXEL,
      api_key: c.apiKey,
      signature: cloudinarySignature(params, c.apiSecret, algorithm),
      ...(algorithm === 'sha256' ? { signature_algorithm: 'sha256' } : {}),
    });
    const res = await fetch(`${base}/v1_1/${c.cloudName}/image/upload`, { method: 'POST', body });
    if (res.ok) {
      works.push(algorithm);
      const destroy = { public_id: params.public_id, timestamp: String(Math.floor(Date.now() / 1000)) };
      await fetch(`${base}/v1_1/${c.cloudName}/image/destroy`, {
        method: 'POST',
        body: new URLSearchParams({
          ...destroy,
          api_key: c.apiKey,
          signature: cloudinarySignature(destroy, c.apiSecret, algorithm),
          ...(algorithm === 'sha256' ? { signature_algorithm: 'sha256' } : {}),
        }),
      }).catch(() => undefined);
    }
    console.log(
      `${res.ok ? '✓' : '✗'} Subida firmada con ${algorithm.toUpperCase()}: ${res.ok ? 'aceptada' : `rechazada (${res.status})`}`,
    );
  }
  if (!works.length) {
    console.log(
      '\nNinguna firma fue aceptada aunque las credenciales son válidas: revisá restricciones de la API key en Cloudinary.',
    );
    process.exitCode = 1;
  } else if (!works.includes(c.signatureAlgorithm!)) {
    console.log(
      `\nLa cuenta firma con ${works[0].toUpperCase()}: definí CLOUDINARY_SIGNATURE_ALGORITHM=${works[0]}.`,
    );
    process.exitCode = 1;
  } else console.log('\nTodo bien: las subidas firmadas van a funcionar.');
}

void main();
