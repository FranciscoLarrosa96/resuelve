import { Inject, Injectable } from '@nestjs/common';
import { EMAIL_SENDER, EmailSender } from './email-sender';

const FOREST = '#1f3d2b';
const CREAM = '#f6f1e7';

/** Arma los emails transaccionales de Resuelve. La entrega es responsabilidad del `EmailSender`. */
@Injectable()
export class EmailService {
  constructor(@Inject(EMAIL_SENDER) private readonly sender: EmailSender) {}

  async sendVerificationCode(to: string, code: string, ttlMinutes: number): Promise<void> {
    await this.sender.send({
      to,
      subject: 'Tu código de verificación de Resuelve',
      html: this.codeTemplate(code, ttlMinutes),
      text: this.codeText(code, ttlMinutes),
    });
  }

  private codeTemplate(code: string, ttlMinutes: number): string {
    return `<!doctype html>
<html lang="es">
  <body style="margin:0;padding:0;background:${CREAM};font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CREAM};padding:32px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;padding:32px;">
            <tr><td style="font-size:20px;font-weight:bold;color:${FOREST};padding-bottom:20px;">Resuelve</td></tr>
            <tr><td style="font-size:18px;color:#1a1a1a;padding-bottom:12px;">Verificá tu email</td></tr>
            <tr><td style="font-size:14px;color:#4a4a4a;padding-bottom:20px;">Tu código es:</td></tr>
            <tr>
              <td style="font-size:32px;font-weight:bold;letter-spacing:6px;color:${FOREST};padding-bottom:20px;">${code}</td>
            </tr>
            <tr><td style="font-size:13px;color:#6b6b6b;padding-bottom:8px;">Vence en ${ttlMinutes} minutos.</td></tr>
            <tr><td style="font-size:12px;color:#9a9a9a;">Si no creaste una cuenta en Resuelve, podés ignorar este mensaje.</td></tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
  }

  private codeText(code: string, ttlMinutes: number): string {
    return [
      'Verificá tu email',
      '',
      `Tu código es: ${code}`,
      '',
      `Vence en ${ttlMinutes} minutos.`,
      '',
      'Si no creaste una cuenta en Resuelve, podés ignorar este mensaje.',
    ].join('\n');
  }
}
