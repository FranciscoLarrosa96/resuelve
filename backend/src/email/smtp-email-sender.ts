import { Logger } from '@nestjs/common';
import { createTransport, Transporter } from 'nodemailer';
import { EmailMessage, EmailSender } from './email-sender';

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from: string;
}

/**
 * Gmail App Password sirve para desarrollo/pruebas (`SMTP_HOST=smtp.gmail.com`),
 * pero cualquier SMTP estándar funciona igual: nada acá depende de Gmail.
 * Para producción con volumen, preferir un proveedor transaccional dedicado.
 * En Render Free no funciona (bloquea 25/465/587): usar `HttpEmailSender`.
 */
export class SmtpEmailSender implements EmailSender {
  private readonly logger = new Logger(SmtpEmailSender.name);
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(config: SmtpConfig) {
    this.from = config.from;
    this.transporter = createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.user ? { user: config.user, pass: config.pass } : undefined,
      // Los defaults de nodemailer esperan 2 min: con el puerto bloqueado el registro quedaba colgado.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
  }

  async send(message: EmailMessage): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
    this.logger.log('Email enviado');
  }
}
