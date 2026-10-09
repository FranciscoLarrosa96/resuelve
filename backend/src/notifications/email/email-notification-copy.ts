import { NotificationType } from '../notification.entity';

/**
 * Qué avisos salen por email y con qué texto. Única fuente: lo que no está
 * acá es solo in-app (se editó un presupuesto, el trabajo empezó, reseñas,
 * referidos). Sin PII: ni nombres, ni direcciones, ni el texto del pedido.
 */
export interface EmailNoticeCopy {
  /** Frase corta para el asunto (aviso único) y para la lista (varios). */
  text: string;
  /** Pantalla donde está la acción. */
  route: (requestId: string | null) => string;
}

const clientRequest = (id: string | null) => (id ? `/mis-solicitudes/${id}` : '/mis-solicitudes');
const proRequest = (id: string | null) => (id ? `/pro/solicitudes/${id}` : '/pro/solicitudes');
const agenda = () => '/pro/agenda';
const plan = () => '/pro/plan#transferencia';

export const EMAIL_NOTICE_COPY: Partial<Record<NotificationType, EmailNoticeCopy>> = {
  PRO_REQUEST_RECEIVED: { text: 'Tenés una nueva solicitud para presupuestar', route: proRequest },
  PRO_TARGETED_REQUEST_RECEIVED: { text: 'Un cliente te pidió un presupuesto a vos', route: proRequest },
  PROFESSIONAL_SELECTED: { text: 'Un cliente te eligió para su trabajo', route: proRequest },
  PRO_APPOINTMENT_CONFIRMED: { text: 'El cliente confirmó el horario del trabajo', route: agenda },
  PRO_APPOINTMENT_DECLINED: { text: 'El cliente necesita otro horario', route: proRequest },
  PRO_JOB_CLOSE_DUE: { text: 'Terminó el horario de un trabajo: marcalo como realizado', route: agenda },
  PRO_TRANSFER_APPROVED: { text: 'Confirmamos tu pago: ya tenés Resuelve PRO', route: plan },
  PRO_TRANSFER_REJECTED: { text: 'No pudimos confirmar tu pago por transferencia', route: plan },
  PRO_TRANSFER_EXPIRING: { text: 'Tu Resuelve PRO vence en unos días', route: plan },
  CLIENT_QUOTE_RECEIVED: { text: 'Recibiste un presupuesto nuevo', route: clientRequest },
  CLIENT_APPOINTMENT_PROPOSED: { text: 'Un profesional te propuso un horario para confirmar', route: clientRequest },
  CLIENT_APPOINTMENT_RESCHEDULED: { text: 'Un profesional propuso otro horario', route: clientRequest },
  CLIENT_JOB_SCHEDULED: { text: 'Tu trabajo quedó agendado', route: clientRequest },
  CLIENT_JOB_RESCHEDULED: { text: 'Cambió el horario de tu trabajo', route: clientRequest },
  CLIENT_JOB_CANCELLED: { text: 'Se canceló un trabajo', route: clientRequest },
  CLIENT_JOB_CLOSE_DUE: { text: 'Terminó el horario de tu trabajo: ¿se realizó?', route: clientRequest },
};
