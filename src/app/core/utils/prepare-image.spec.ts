import { prepareImageForUpload, storageRejection } from './prepare-image';

describe('fotos antes de subir', () => {
  it('sin decodificador de imágenes (o con un archivo que no es imagen) sube el original', async () => {
    const pdf = new File(['%PDF'], 'matricula.pdf', { type: 'application/pdf' });
    expect(await prepareImageForUpload(pdf)).toBe(pdf);
    const photo = new File(['jpeg'], 'IMG_0001.jpg', { type: 'image/jpeg' });
    const original = globalThis.createImageBitmap;
    (globalThis as { createImageBitmap?: unknown }).createImageBitmap = () => Promise.reject(new Error('no'));
    try {
      expect(await prepareImageForUpload(photo)).toBe(photo);
    } finally {
      (globalThis as { createImageBitmap?: unknown }).createImageBitmap = original;
    }
  });

  it('del rechazo del almacenamiento solo toma su mensaje (para diagnosticar)', () => {
    expect(storageRejection({ status: 400, error: { error: { message: 'Image file format heic not allowed' } } })).toBe(
      'Image file format heic not allowed',
    );
    expect(storageRejection({ status: 0 })).toBeNull();
  });
});
