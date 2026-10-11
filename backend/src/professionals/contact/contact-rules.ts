import type { ProfessionalProfile } from '../professional-profile.entity';
import { isPublicProfile } from '../professional-rules';

/**
 * Canales de contacto del profesional. ÚNICA fuente de qué canal está disponible para
 * terceros; la búsqueda usa el SQL equivalente.
 *
 * - WhatsApp y llamadas: contacto directo, sin pasar por Resuelve. Solo con número
 *   guardado Y consentimiento explícito para mostrarlo (`contactConsentAt`).
 * - Solicitudes por Resuelve: el flujo de solicitudes y presupuestos de siempre, con sus
 *   reglas de elegibilidad y cupos. Apagado = no recibe invitaciones nuevas (lo ya
 *   recibido, presupuestos y trabajos en curso siguen igual).
 * - Un perfil pausado no ofrece ningún canal.
 *
 * Un clic en WhatsApp o Llamar NO es una solicitud, ni un presupuesto, ni un primer
 * éxito, ni consume cupo Free: solo se registra como clic anónimo (`exposure_events`).
 */
export type ContactChannel = 'WHATSAPP' | 'PHONE';

type ContactProfile = Pick<
  ProfessionalProfile,
  | 'status'
  | 'contactWhatsappEnabled'
  | 'contactCallsEnabled'
  | 'contactRequestsEnabled'
  | 'contactWhatsappNumber'
  | 'contactPhoneNumber'
  | 'contactConsentAt'
>;

export interface PublicContactChannels {
  whatsapp: boolean;
  phone: boolean;
  requests: boolean;
}

export function publicContactChannels(p: ContactProfile): PublicContactChannels {
  if (!isPublicProfile(p)) return { whatsapp: false, phone: false, requests: false };
  const consent = !!p.contactConsentAt;
  return {
    whatsapp: consent && p.contactWhatsappEnabled && !!p.contactWhatsappNumber,
    phone: consent && p.contactCallsEnabled && !!p.contactPhoneNumber,
    requests: p.contactRequestsEnabled,
  };
}

/** Número publicable para ese canal, o null si el canal no está disponible. */
export function contactNumberFor(p: ContactProfile, channel: ContactChannel): string | null {
  const channels = publicContactChannels(p);
  if (channel === 'WHATSAPP') return channels.whatsapp ? p.contactWhatsappNumber : null;
  return channels.phone ? p.contactPhoneNumber : null;
}

/** Tiene WhatsApp o llamadas publicables (alias `p`). Prioriza las tarjetas de urgencias. */
export const HAS_DIRECT_CONTACT_SQL = `(p.contact_consent_at IS NOT NULL AND (
  (p.contact_whatsapp_enabled AND p.contact_whatsapp_number IS NOT NULL)
  OR (p.contact_calls_enabled AND p.contact_phone_number IS NOT NULL)))`;
