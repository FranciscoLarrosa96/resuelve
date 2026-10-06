export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Enlace de baja: va también como cabecera `List-Unsubscribe`. */
  unsubscribeUrl?: string;
}

/**
 * Puerto de envío. `EmailService` arma el mensaje (subject/HTML/text); el
 * sender solo lo entrega. Cambiar de Gmail SMTP a un proveedor transaccional
 * (Resend, Postmark, SES, Brevo…) es reemplazar el `useFactory` en
 * `EmailModule`, sin tocar `AuthService` ni `EmailVerificationService`.
 */
export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

export const EMAIL_SENDER = Symbol('EMAIL_SENDER');
