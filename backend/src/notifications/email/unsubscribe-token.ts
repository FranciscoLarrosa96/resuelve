import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Token del enlace de baja: `<userId>.<firma>`. Firmado con una clave derivada
 * del secreto de acceso, sin vencimiento (la baja tiene que funcionar siempre)
 * y que solo sirve para apagar los avisos de esa cuenta, nada más.
 */
const PURPOSE = 'email-notifications-unsubscribe';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const sign = (secret: string, userId: string) =>
  createHmac('sha256', `${secret}:${PURPOSE}`).update(userId).digest('base64url');

export function createUnsubscribeToken(secret: string, userId: string): string {
  return `${userId}.${sign(secret, userId)}`;
}

/** Devuelve el id de la cuenta si la firma es válida; `null` si no. */
export function readUnsubscribeToken(secret: string, token: string): string | null {
  const [userId, signature, extra] = token.split('.');
  if (!userId || !signature || extra !== undefined || !UUID.test(userId)) return null;
  const expected = Buffer.from(sign(secret, userId));
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
  return userId;
}
