import webpush from 'web-push';

export const PUSH_SENDER = Symbol('PUSH_SENDER');

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** `gone`: el servicio dice que la suscripción ya no existe (404/410): se borra. */
export type PushResult = { ok: true } | { ok: false; gone: boolean; reason: string };

export interface PushSender {
  /** false = sin claves VAPID: no se ofrece ni se manda nada. */
  readonly configured: boolean;
  readonly publicKey: string | null;
  send(target: PushTarget, payload: string): Promise<PushResult>;
}

export interface VapidConfig {
  publicKey?: string;
  privateKey?: string;
  subject?: string;
}

/** Web Push estándar con la librería `web-push` (VAPID). Sin Firebase ni proveedor pago. */
export class WebPushSender implements PushSender {
  readonly configured: boolean;
  readonly publicKey: string | null;
  private readonly vapid: { subject: string; publicKey: string; privateKey: string } | null;

  constructor(config: VapidConfig) {
    const publicKey = config.publicKey?.trim();
    const privateKey = config.privateKey?.trim();
    const subject = config.subject?.trim();
    this.configured = !!(publicKey && privateKey && subject);
    this.publicKey = this.configured ? publicKey! : null;
    this.vapid = this.configured ? { subject: subject!, publicKey: publicKey!, privateKey: privateKey! } : null;
  }

  async send(target: PushTarget, payload: string): Promise<PushResult> {
    if (!this.vapid) return { ok: false, gone: false, reason: 'sin claves VAPID' };
    try {
      await webpush.sendNotification(
        { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
        payload,
        // 12 h: un aviso que no llega antes ya no sirve. `normal`: no despierta el teléfono a la fuerza.
        { vapidDetails: this.vapid, TTL: 12 * 3600, urgency: 'normal', timeout: 10_000 },
      );
      return { ok: true };
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      return { ok: false, gone: status === 404 || status === 410, reason: status ? `HTTP ${status}` : (error as Error).message };
    }
  }
}
