import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EMAIL_SENDER } from './email-sender';
import { EmailService } from './email.service';
import { NoopEmailSender } from './noop-email-sender';
import { SmtpEmailSender } from './smtp-email-sender';

@Module({
  providers: [
    {
      provide: EMAIL_SENDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const host = config.get<string>('SMTP_HOST');
        if (!host) return new NoopEmailSender();
        return new SmtpEmailSender({
          host,
          port: config.get<number>('SMTP_PORT', 465),
          secure: config.get<boolean>('SMTP_SECURE', true),
          user: config.get<string>('SMTP_USER'),
          pass: config.get<string>('SMTP_PASS'),
          from: config.get<string>('EMAIL_FROM', 'Resuelve <no-responder@resuelve.dev>'),
        });
      },
    },
    EmailService,
  ],
  exports: [EmailService, EMAIL_SENDER],
})
export class EmailModule {}
