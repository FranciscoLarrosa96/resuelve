import { Logger } from '@nestjs/common';
import { EmailMessage, EmailSender } from './email-sender';

export type HttpEmailProvider = 'brevo' | 'resend';

export interface HttpEmailConfig {
  provider: HttpEmailProvider;
  apiKey: string;
  from: string;
  timeoutMs?: number;
}

export interface EmailAddress {
  name?: string;
  email: string;
}

/** `"Resuelve <hola@x.com>"` → `{ name: 'Resuelve', email: 'hola@x.com' }`; `"hola@x.com"` → `{ email }`. */
export function parseFromAddress(from: string): EmailAddress {
  const trimmed = from.trim();
  const match = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(trimmed);
  if (!match) return { email: trimmed };
  const name = match[1].trim();
  return name ? { name, email: match[2].trim() } : { email: match[2].trim() };
}

/** Request HTTP de cada proveedor (separado para testearlo sin red). */
export function buildProviderRequest(
  config: HttpEmailConfig,
  message: EmailMessage,
): { url: string; headers: Record<string, string>; body: unknown } {
  if (config.provider === 'brevo') {
    return {
      url: 'https://api.brevo.com/v3/smtp/email',
      headers: { 'api-key': config.apiKey, 'content-type': 'application/json', accept: 'application/json' },
      body: {
        sender: parseFromAddress(config.from),
        to: [{ email: message.to }],
        subject: message.subject,
        htmlContent: message.html,
        textContent: message.text,
      },
    };
  }
  return {
    url: 'https://api.resend.com/emails',
    headers: { authorization: `Bearer ${config.apiKey}`, 'content-type': 'application/json' },
    body: { from: config.from, to: [message.to], subject: message.subject, html: message.html, text: message.text },
  };
}

/**
 * Envío por API HTTPS (puerto 443). Existe porque Render Free bloquea la
 * salida SMTP (25/465/587): nodemailer se queda colgado hasta `Connection
 * timeout`. Brevo acepta un remitente verificado sin dominio propio (sirve una
 * Gmail); Resend necesita dominio verificado para mandar a cualquiera.
 */
export class HttpEmailSender implements EmailSender {
  private readonly logger = new Logger(HttpEmailSender.name);

  constructor(private readonly config: HttpEmailConfig) {}

  async send(message: EmailMessage): Promise<void> {
    const { url, headers, body } = buildProviderRequest(this.config, message);
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.config.timeoutMs ?? 10_000),
    });
    if (!res.ok) {
      // El cuerpo de error del proveedor explica el motivo (remitente sin verificar, API key inválida…).
      const detail = (await res.text().catch(() => '')).slice(0, 300);
      throw new Error(`${this.config.provider} respondió ${res.status}: ${detail}`);
    }
    this.logger.log({ provider: this.config.provider }, 'Email enviado');
  }
}
