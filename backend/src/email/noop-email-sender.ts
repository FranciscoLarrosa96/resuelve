import { Logger } from '@nestjs/common';
import { EmailMessage, EmailSender } from './email-sender';

/**
 * Sin SMTP configurado (dev sin variables cargadas): no se envía nada, pero
 * el registro/reenvío no rompe. Nunca loguea el contenido del mensaje.
 */
export class NoopEmailSender implements EmailSender {
  private readonly logger = new Logger(NoopEmailSender.name);

  async send(message: EmailMessage): Promise<void> {
    this.logger.warn({ to: message.to }, 'SMTP no configurado: email no enviado');
  }
}
