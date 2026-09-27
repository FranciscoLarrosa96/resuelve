import { createHash } from 'crypto';
import { cleanEnvValue, cloudinarySignature, readCloudinaryConfig } from './cloudinary';

describe('cloudinarySignature', () => {
  const params = {
    eager: 'w_400,h_300,c_pad|w_260,h_200,c_crop',
    public_id: 'sample_image',
    timestamp: '1315060510',
  };

  it('coincide con el ejemplo oficial de Cloudinary (SHA-1)', () => {
    expect(cloudinarySignature(params, 'abcd')).toBe('bfd09f95f331f558cbd1320e67aa8d488770583e');
  });

  it('SHA-256 cuando la cuenta lo usa', () => {
    const payload =
      'eager=w_400,h_300,c_pad|w_260,h_200,c_crop&public_id=sample_image&timestamp=1315060510abcd';
    expect(cloudinarySignature(params, 'abcd', 'sha256')).toBe(
      createHash('sha256').update(payload).digest('hex'),
    );
  });
});

describe('readCloudinaryConfig', () => {
  const env = (vars: Record<string, string>) => (k: string) => vars[k];

  it('limpia espacios, saltos de línea y comillas pegados desde el panel', () => {
    expect(cleanEnvValue('  abc \n')).toBe('abc');
    expect(cleanEnvValue('"abc"')).toBe('abc');
    expect(cleanEnvValue("'abc' ")).toBe('abc');
    expect(cleanEnvValue('   ')).toBeUndefined();
    const c = readCloudinaryConfig(
      env({ CLOUDINARY_CLOUD_NAME: 'demo ', CLOUDINARY_API_KEY: ' 123', CLOUDINARY_API_SECRET: 'sec\n' }),
    );
    expect(c).toMatchObject({
      cloudName: 'demo',
      apiKey: '123',
      apiSecret: 'sec',
      signatureAlgorithm: 'sha1',
    });
  });

  it('acepta CLOUDINARY_URL; las variables sueltas tienen prioridad', () => {
    expect(
      readCloudinaryConfig(env({ CLOUDINARY_URL: 'cloudinary://887878:s3cr%2Bt@czibkfkv' })),
    ).toMatchObject({
      cloudName: 'czibkfkv',
      apiKey: '887878',
      apiSecret: 's3cr+t',
    });
    expect(
      readCloudinaryConfig(env({ CLOUDINARY_URL: 'cloudinary://k:s@c', CLOUDINARY_API_SECRET: 'otro' }))
        .apiSecret,
    ).toBe('otro');
    expect(readCloudinaryConfig(env({ CLOUDINARY_URL: 'no es una url' })).cloudName).toBeUndefined();
  });

  it('algoritmo: sha256 solo si se pide', () => {
    expect(readCloudinaryConfig(env({ CLOUDINARY_SIGNATURE_ALGORITHM: 'SHA256' })).signatureAlgorithm).toBe(
      'sha256',
    );
    expect(readCloudinaryConfig(env({})).signatureAlgorithm).toBe('sha1');
  });
});
