import { Logger } from '@nestjs/common';
import { EmailMessage, EmailSender } from './email-sender';

export interface ResendConfig {
  apiKey: string;
  from: string;
}

const RESEND_URL = 'https://api.resend.com/emails';
const TIMEOUT_MS = 10_000;

/**
 * Envío por la API HTTP de Resend (HTTPS 443): funciona en Render Free, que
 * bloquea los puertos SMTP. Si falla, tira error igual que el sender SMTP.
 */
export class ResendEmailSender implements EmailSender {
  private readonly logger = new Logger(ResendEmailSender.name);

  constructor(private readonly config: ResendConfig) {}

  async send(message: EmailMessage): Promise<void> {
    const response = await fetch(RESEND_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.config.from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
        headers: message.unsubscribeUrl ? { 'List-Unsubscribe': `<${message.unsubscribeUrl}>` } : undefined,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      const detail = (await response.text().catch(() => '')).slice(0, 300);
      throw new Error(`Resend respondió ${response.status}: ${detail}`);
    }
    this.logger.log('Email enviado');
  }
}
