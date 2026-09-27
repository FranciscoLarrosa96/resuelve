import { cloudinarySignature } from '../../common/cloudinary';
import { CloudinaryAvatarStorage, avatarFolder } from './avatar-storage';

describe('CloudinaryAvatarStorage', () => {
  const storage = new CloudinaryAvatarStorage({ cloudName: 'demo', apiKey: 'key', apiSecret: 'secret' });

  it('firma una subida PÚBLICA, solo imágenes, con transformación de entrada (sin EXIF)', () => {
    const t = storage.createUploadTicket(avatarFolder('pro-1'));
    expect(t.publicId).toMatch(/^resuelve\/avatars\/pro-1\/[0-9a-f-]{36}$/);
    expect(t.fields).toMatchObject({
      type: 'upload',
      allowed_formats: 'jpg,png,webp',
      overwrite: 'false',
      transformation: 'c_limit,w_1600,h_1600',
      api_key: 'key',
    });
    const { signature, ...rest } = t.fields;
    const signed = Object.fromEntries(Object.entries(rest).filter(([k]) => k !== 'api_key'));
    expect(signature).toBe(cloudinarySignature(signed, 'secret'));
    expect(t.maxBytes).toBe(5 * 1024 * 1024);
  });

  it('entrega 256×256 recortada (c_fill + g_auto), q_auto, f_auto y versionada', () => {
    expect(storage.deliveryUrl({ publicId: 'resuelve/avatars/p/x', version: 17 })).toBe(
      'https://res.cloudinary.com/demo/image/upload/c_fill,g_auto,w_256,h_256,q_auto,f_auto/v17/resuelve/avatars/p/x',
    );
  });

  it('sin credenciales no está configurado', () => {
    expect(new CloudinaryAvatarStorage({}).configured).toBe(false);
  });
});
