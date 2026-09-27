import { createHmac } from 'crypto';
import { signatureTimestamp, webhookSignatureError } from './webhook-signature';

const secret = 'clave-secreta';
const sign = (manifest: string, key = secret) => createHmac('sha256', key).update(manifest).digest('hex');

describe('webhookSignatureError (validador del SDK oficial)', () => {
  const ts = '1790000000';
  const header = (hash: string) => `ts=${ts},v1=${hash}`;

  it('acepta el manifiesto documentado id;request-id;ts', () => {
    const hash = sign(`id:12345;request-id:req-1;ts:${ts};`);
    expect(webhookSignatureError({ xSignature: header(hash), xRequestId: 'req-1', dataId: '12345', secret })).toBeNull();
  });

  it('usa data.id en minúsculas', () => {
    const hash = sign(`id:abc123;request-id:req-1;ts:${ts};`);
    expect(webhookSignatureError({ xSignature: header(hash), xRequestId: 'req-1', dataId: 'ABC123', secret })).toBeNull();
  });

  it('rechaza firma de otra clave, otro recurso, sin header o sin secret', () => {
    const hash = sign(`id:12345;request-id:req-1;ts:${ts};`, 'otra');
    expect(webhookSignatureError({ xSignature: header(hash), xRequestId: 'req-1', dataId: '12345', secret })).toBe(
      'SignatureMismatch',
    );
    const ok = sign(`id:12345;request-id:req-1;ts:${ts};`);
    expect(webhookSignatureError({ xSignature: header(ok), xRequestId: 'req-1', dataId: '99999', secret })).toBe(
      'SignatureMismatch',
    );
    expect(webhookSignatureError({ xSignature: undefined, xRequestId: 'req-1', dataId: '1', secret })).toBe(
      'MissingSignatureHeader',
    );
    expect(webhookSignatureError({ xSignature: header(ok), xRequestId: 'req-1', dataId: '12345', secret: undefined })).toBe(
      'NoSecretConfigured',
    );
  });

  it('extrae ts para auditoría', () => {
    expect(signatureTimestamp('ts=1790000000,v1=abc')).toBe('1790000000');
    expect(signatureTimestamp('v1=abc')).toBeNull();
  });
});
