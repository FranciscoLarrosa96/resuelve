import { Inject, Injectable } from '@nestjs/common';
import { EMAIL_SENDER, EmailSender } from './email-sender';

const FOREST = '#1f3d2b';
const CREAM = '#f6f1e7';

const escapeHtml = (v: string) =>
  v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

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

  /**
   * Aviso de actividad: una o varias novedades en un solo mensaje. Solo frases
   * genéricas y enlaces a la app (nunca nombres, direcciones ni textos del pedido).
   */
  async sendActivityNotice(input: {
    to: string;
    items: { text: string; url: string }[];
    unsubscribeUrl: string;
  }): Promise<void> {
    const { to, items, unsubscribeUrl } = input;
    const single = items.length === 1;
    const subject = single ? items[0].text : `Tenés ${items.length} novedades en Resuelve`;
    const cta = items[0].url;
    const list = items
      .map(
        (i) =>
          `<tr><td style="font-size:15px;color:#1a1a1a;padding:6px 0;"><a href="${escapeHtml(i.url)}" style="color:${FOREST};">${escapeHtml(i.text)}</a></td></tr>`,
      )
      .join('');
    const html = `<!doctype html>
<html lang="es">
  <body style="margin:0;padding:0;background:${CREAM};font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CREAM};padding:32px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;padding:32px;">
            <tr><td style="font-size:20px;font-weight:bold;color:${FOREST};padding-bottom:20px;">Resuelve</td></tr>
            <tr><td style="font-size:18px;color:#1a1a1a;padding-bottom:12px;">${escapeHtml(subject)}</td></tr>
            ${single ? '' : list}
            <tr><td style="padding:20px 0;"><a href="${escapeHtml(cta)}" style="display:inline-block;background:${FOREST};color:#ffffff;text-decoration:none;font-size:15px;font-weight:bold;padding:12px 22px;border-radius:12px;">Abrir Resuelve</a></td></tr>
            <tr><td style="font-size:12px;color:#9a9a9a;">Te escribimos porque tenés actividad en tu cuenta de Resuelve. <a href="${escapeHtml(unsubscribeUrl)}" style="color:#6b6b6b;">Dejar de recibir estos avisos</a>.</td></tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
    const text = [
      subject,
      '',
      ...(single ? [] : items.map((i) => `- ${i.text}`)),
      ...(single ? [] : ['']),
      `Abrí Resuelve: ${cta}`,
      '',
      `Para dejar de recibir estos avisos: ${unsubscribeUrl}`,
    ].join('\n');
    await this.sender.send({ to, subject, html, text, unsubscribeUrl });
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
