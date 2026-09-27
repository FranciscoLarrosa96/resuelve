import { InvalidWebhookSignatureError, WebhookSignatureValidator } from 'mercadopago';

export interface SignatureInput {
  xSignature: string | undefined;
  xRequestId: string | undefined;
  /** `data.id` de los query params (en minúsculas si es alfanumérico). */
  dataId: string | undefined;
  secret: string | undefined;
}

/**
 * Valida `x-signature` con el validador del SDK oficial de Mercado Pago
 * (HMAC-SHA256 del manifiesto `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`
 * con la clave secreta de Webhooks). Devuelve el motivo del rechazo o null.
 */
export function webhookSignatureError(input: SignatureInput): string | null {
  if (!input.secret) return 'NoSecretConfigured';
  try {
    WebhookSignatureValidator.validate({
      xSignature: input.xSignature,
      xRequestId: input.xRequestId,
      dataId: input.dataId?.toLowerCase(),
      secret: input.secret,
    });
    return null;
  } catch (error) {
    return error instanceof InvalidWebhookSignatureError ? error.reason : 'InvalidSignature';
  }
}

/** `ts` del header (segundos) para auditoría. */
export function signatureTimestamp(xSignature: string | undefined): string | null {
  const ts = xSignature?.split(',').find((p) => p.trim().startsWith('ts='));
  const value = ts?.split('=')[1]?.trim();
  return value && /^\d{1,15}$/.test(value) ? value : null;
}
