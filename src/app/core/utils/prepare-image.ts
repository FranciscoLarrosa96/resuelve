/** Lado mayor con el que se sube una foto pública (el mismo tope que aplica Cloudinary al recibirla). */
export const UPLOAD_MAX_SIDE = 1600;
/** Por debajo de este peso y del tamaño máximo, la foto se sube tal cual. */
const LIGHT_ENOUGH_BYTES = 1.5 * 1024 * 1024;
const PASS_THROUGH_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** El navegador puede decodificar y recodificar imágenes (sin esto, se sube el original sin esperar). */
export function canPrepareImages(): boolean {
  return typeof createImageBitmap === 'function' && typeof document !== 'undefined';
}

/**
 * Achica en el navegador una foto pública antes de subirla (perfil, portada y trabajos):
 * lado mayor ≤ 1600 px, JPEG (PNG si era PNG, para no perder transparencia), respetando la
 * orientación de la cámara y sin metadatos (EXIF fuera). Las fotos de celular (12–48 MP,
 * varios MB, a veces convertidas de HEIC) suben más rápido y no chocan con los límites del
 * almacenamiento. Si el navegador no puede decodificarla, se sube el archivo original y el
 * backend la valida como siempre.
 */
export async function prepareImageForUpload(file: File, maxSide = UPLOAD_MAX_SIDE): Promise<File> {
  if (!file.type.startsWith('image/') || !canPrepareImages()) {
    return file;
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return file;
  }
  try {
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size <= LIGHT_ENOUGH_BYTES && PASS_THROUGH_TYPES.includes(file.type)) return file;
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    const png = file.type === 'image/png';
    if (!png) {
      // JPEG no tiene transparencia: fondo blanco en vez de negro.
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, width, height);
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    const type = png ? 'image/png' : 'image/jpeg';
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.86));
    if (!blob) return file;
    if (scale === 1 && blob.size >= file.size && PASS_THROUGH_TYPES.includes(file.type)) return file;
    const name = `${file.name.replace(/\.[^.]+$/, '') || 'foto'}.${png ? 'png' : 'jpg'}`;
    return new File([blob], name, { type, lastModified: file.lastModified });
  } finally {
    bitmap.close();
  }
}

/** Para diagnosticar un rechazo del almacenamiento: su mensaje (nunca se muestra al usuario tal cual). */
export function storageRejection(error: unknown): string | null {
  const body = (error as { error?: { error?: { message?: unknown } } })?.error;
  const message = body?.error?.message;
  return typeof message === 'string' ? message : null;
}
