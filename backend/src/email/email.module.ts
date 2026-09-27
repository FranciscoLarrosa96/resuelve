import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EMAIL_SENDER, EmailSender } from './email-sender';
import { EmailService } from './email.service';
import { HttpEmailSender } from './http-email-sender';
import { NoopEmailSender } from './noop-email-sender';
import { SmtpEmailSender } from './smtp-email-sender';

const DEFAULT_FROM = 'Resuelve <no-responder@resuelve.dev>';

/**
 * Elige el sender por las variables cargadas: API HTTPS (Brevo, Resend) antes
 * que SMTP, porque Render Free bloquea los puertos SMTP. Sin nada → Noop.
 */
export function createEmailSender(config: ConfigService): EmailSender {
  const from = config.get<string>('EMAIL_FROM') || DEFAULT_FROM;
  const brevoKey = config.get<string>('BREVO_API_KEY');
  if (brevoKey) return new HttpEmailSender({ provider: 'brevo', apiKey: brevoKey, from });
  const resendKey = config.get<string>('RESEND_API_KEY');
  if (resendKey) return new HttpEmailSender({ provider: 'resend', apiKey: resendKey, from });

  const host = config.get<string>('SMTP_HOST');
  if (!host) return new NoopEmailSender();
  return new SmtpEmailSender({
    host,
    port: config.get<number>('SMTP_PORT', 465),
    secure: config.get<boolean>('SMTP_SECURE', true),
    user: config.get<string>('SMTP_USER'),
    pass: config.get<string>('SMTP_PASS'),
    from,
  });
}

@Module({
  providers: [
    { provide: EMAIL_SENDER, inject: [ConfigService], useFactory: createEmailSender },
    EmailService,
  ],
  exports: [EmailService, EMAIL_SENDER],
})
export class EmailModule {}
