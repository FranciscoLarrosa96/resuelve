import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { publicFrontendUrl } from '../config/frontend-url';
import { EMAIL_SENDER, EmailSender } from './email-sender';

/**
 * Paleta del manual de marca (tokens de `src/styles.css`, tema claro). Los
 * clientes de correo no leen variables CSS: van en hex solo acá.
 */
const C = {
  canvas: '#f7f3eb', // Cream 50
  surface: '#fffdf9',
  line: '#e5dfd4', // Sand 200
  brand: '#1d4f5c', // Petrol 700
  onBrand: '#fffdf9',
  ink: '#1d2423', // Ink 900
  inkSoft: '#414c48',
  muted: '#606b67',
  accent: '#a85432', // Terracotta 700
};
const SANS = "Archivo,'Helvetica Neue',Helvetica,Arial,sans-serif";
const SERIF = "'Source Serif 4',Georgia,'Times New Roman',serif";

const escapeHtml = (v: string) =>
  v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Arma los emails transaccionales de Resuelve. La entrega es responsabilidad del `EmailSender`. */
@Injectable()
export class EmailService {
  constructor(
    @Inject(EMAIL_SENDER) private readonly sender: EmailSender,
    private readonly config: ConfigService,
  ) {}

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
        (i) => `<tr>
                <td width="18" valign="top" style="padding:9px 0 9px 0;font-size:15px;line-height:22px;color:${C.accent};">&#9679;</td>
                <td style="padding:9px 0;font-family:${SANS};font-size:15px;line-height:22px;"><a href="${escapeHtml(i.url)}" style="color:${C.ink};text-decoration:underline;text-decoration-color:${C.line};">${escapeHtml(i.text)}</a></td>
              </tr>`,
      )
      .join('');
    const body = `
            <tr><td style="font-family:${SERIF};font-size:24px;line-height:31px;font-weight:600;color:${C.ink};padding-bottom:10px;">${escapeHtml(subject)}</td></tr>
            <tr><td style="font-family:${SANS};font-size:15px;line-height:23px;color:${C.inkSoft};padding-bottom:${single ? '24' : '12'}px;">${single ? 'Entrá a Resuelve para ver el detalle y seguir desde ahí.' : 'Esto es lo nuevo en tu cuenta:'}</td></tr>
            ${single ? '' : `<tr><td style="padding-bottom:20px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${C.line};border-bottom:1px solid ${C.line};">${list}</table></td></tr>`}
            <tr><td style="padding-bottom:24px;">${this.button(cta, single ? 'Ver en Resuelve' : 'Abrir Resuelve')}</td></tr>
            <tr><td style="font-family:${SANS};font-size:13px;line-height:20px;color:${C.muted};">Si el botón no funciona, copiá este enlace en tu navegador:<br /><a href="${escapeHtml(cta)}" style="color:${C.brand};word-break:break-all;">${escapeHtml(cta)}</a></td></tr>`;
    const html = this.layout({
      preheader: single ? 'Entrá a Resuelve para ver el detalle.' : items.map((i) => i.text).join(' · '),
      body,
      footer: `Te escribimos porque tenés actividad en tu cuenta de Resuelve.<br /><a href="${escapeHtml(unsubscribeUrl)}" style="color:${C.muted};text-decoration:underline;">Dejar de recibir estos avisos</a>`,
    });
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
    const body = `
            <tr><td style="font-family:${SERIF};font-size:24px;line-height:31px;font-weight:600;color:${C.ink};padding-bottom:10px;">Verificá tu email</td></tr>
            <tr><td style="font-family:${SANS};font-size:15px;line-height:23px;color:${C.inkSoft};padding-bottom:20px;">Ingresá este código en Resuelve para terminar de crear tu cuenta.</td></tr>
            <tr><td style="padding-bottom:20px;"><span style="display:inline-block;background:${C.canvas};border:1px solid ${C.line};border-radius:12px;padding:14px 22px;font-family:${SANS};font-size:32px;line-height:36px;font-weight:700;letter-spacing:8px;color:${C.brand};">${escapeHtml(code)}</span></td></tr>
            <tr><td style="font-family:${SANS};font-size:13px;line-height:20px;color:${C.muted};">Vence en ${ttlMinutes} minutos.</td></tr>`;
    return this.layout({
      preheader: `Tu código es ${code}. Vence en ${ttlMinutes} minutos.`,
      body,
      footer: 'Si no creaste una cuenta en Resuelve, podés ignorar este mensaje.',
    });
  }

  /** Botón "a prueba de clientes de correo": tabla + enlace con padding (Outlook incluido). */
  private button(url: string, label: string): string {
    return `<table role="presentation" cellpadding="0" cellspacing="0"><tr>
              <td bgcolor="${C.brand}" style="border-radius:12px;background:${C.brand};">
                <a href="${escapeHtml(url)}" style="display:inline-block;padding:13px 26px;font-family:${SANS};font-size:15px;line-height:20px;font-weight:600;color:${C.onBrand};text-decoration:none;border-radius:12px;">${escapeHtml(label)}</a>
              </td>
            </tr></table>`;
  }

  /** Estructura común: marca arriba, tarjeta clara y pie fuera de la tarjeta. Siempre tema claro. */
  private layout(input: { preheader: string; body: string; footer: string }): string {
    const home = publicFrontendUrl(this.config.get<string>('FRONTEND_URL'));
    return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <meta name="supported-color-schemes" content="light" />
    <title>Resuelve</title>
  </head>
  <body style="margin:0;padding:0;background:${C.canvas};-webkit-text-size-adjust:100%;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.canvas};">${escapeHtml(input.preheader)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.canvas}" style="background:${C.canvas};">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
            <tr>
              <td style="padding:0 4px 20px;">
                <a href="${escapeHtml(home)}" style="text-decoration:none;">
                  <img src="${escapeHtml(home)}/logo-96.png" width="32" height="32" alt="" style="vertical-align:middle;border:0;border-radius:8px;" />
                  <span style="vertical-align:middle;padding-left:8px;font-family:${SERIF};font-size:22px;font-weight:600;color:${C.brand};">Resuelve</span>
                </a>
              </td>
            </tr>
            <tr>
              <td bgcolor="${C.surface}" style="background:${C.surface};border:1px solid ${C.line};border-top:4px solid ${C.brand};border-radius:16px;padding:32px 28px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${input.body}
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 4px 0;font-family:${SANS};font-size:12px;line-height:18px;color:${C.muted};">
                ${input.footer}<br /><br />Resuelve · Servicios de confianza en Tandil
              </td>
            </tr>
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
