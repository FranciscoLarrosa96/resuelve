import { NotificationType } from '../notification.entity';

/**
 * Qué avisos salen como push y con qué texto. Única fuente: lo que no está acá
 * queda solo en la app (reseñas recibidas y referidos pueden esperar a que la abras).
 * Sin PII: el texto pasa por el servicio de push del navegador (Google, Apple,
 * Mozilla), así que nunca lleva nombres, montos, direcciones ni el pedido.
 */
export interface PushCopy {
  title: string;
  body: string;
}

export const PUSH_COPY: Partial<Record<NotificationType, PushCopy>> = {
  PRO_REQUEST_RECEIVED: { title: 'Nueva solicitud', body: 'Tenés una solicitud nueva para presupuestar.' },
  PRO_TARGETED_REQUEST_RECEIVED: { title: 'Te pidieron presupuesto', body: 'Un cliente te eligió a vos para pedirte presupuesto.' },
  PROFESSIONAL_SELECTED: { title: 'Te eligieron', body: 'Un cliente aceptó tu presupuesto. Coordiná el horario.' },
  PRO_APPOINTMENT_CONFIRMED: { title: 'Horario confirmado', body: 'El cliente confirmó el horario del trabajo.' },
  PRO_APPOINTMENT_DECLINED: { title: 'Necesitan otro horario', body: 'El cliente necesita que propongas otro horario.' },
  PRO_JOB_CLOSE_DUE: { title: '¿Se realizó el trabajo?', body: 'Terminó el horario de un trabajo: marcalo como realizado.' },
  // Sí sale: pedir la reseña sirve en el momento (las reseñas recibidas sí pueden esperar).
  PRO_JOB_COMPLETED: { title: 'Trabajo realizado', body: 'El cliente marcó el trabajo como realizado. Pedile una reseña.' },
  CLIENT_QUOTE_RECEIVED: { title: 'Presupuesto nuevo', body: 'Recibiste un presupuesto para tu solicitud.' },
  CLIENT_QUOTE_UPDATED: { title: 'Presupuesto actualizado', body: 'Un profesional actualizó su presupuesto.' },
  CLIENT_APPOINTMENT_PROPOSED: { title: 'Horario para confirmar', body: 'Un profesional te propuso un horario.' },
  CLIENT_APPOINTMENT_RESCHEDULED: { title: 'Otro horario propuesto', body: 'Un profesional propuso otro horario.' },
  CLIENT_JOB_SCHEDULED: { title: 'Trabajo agendado', body: 'Tu trabajo quedó agendado.' },
  CLIENT_JOB_RESCHEDULED: { title: 'Cambió el horario', body: 'Cambió el horario de tu trabajo.' },
  CLIENT_JOB_STARTED: { title: 'Empezó tu trabajo', body: 'El profesional empezó tu trabajo.' },
  CLIENT_JOB_CANCELLED: { title: 'Trabajo cancelado', body: 'Se canceló un trabajo.' },
  CLIENT_JOB_CLOSE_DUE: { title: '¿Se realizó el trabajo?', body: 'Terminó el horario de tu trabajo: contanos si se hizo.' },
};

/** Varias novedades de una persona en el mismo ciclo: un solo aviso. */
export const pushSummaryCopy = (count: number): PushCopy => ({
  title: 'Resuelve',
  body: `Tenés ${count} novedades para ver.`,
});
