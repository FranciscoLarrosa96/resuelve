/**
 * Notificaciones in-app (GET /me/notifications…). Solo eventos que le piden
 * a la otra persona que vea o haga algo; nunca la propia acción.
 */
export type NotificationAudience = 'CLIENT' | 'PROFESSIONAL';

export type NotificationType =
  | 'CLIENT_QUOTE_RECEIVED'
  | 'CLIENT_APPOINTMENT_PROPOSED'
  | 'CLIENT_APPOINTMENT_RESCHEDULED'
  | 'PROFESSIONAL_SELECTED'
  | 'PRO_APPOINTMENT_CONFIRMED'
  | 'PRO_APPOINTMENT_DECLINED';

export interface AppNotification {
  id: string;
  type: NotificationType;
  requestId: string;
  /** Título del pedido (sin dirección, teléfono ni descripción). */
  requestTitle: string;
  /** Solo en CLIENT_QUOTE_RECEIVED: quién mandó el presupuesto. */
  professionalName: string | null;
  createdAt: string;
  readAt: string | null;
}

export interface NotificationsSummary {
  client: { unread: number; completionDue: number };
  /** `null` sin perfil profesional. */
  professional: { unread: number; completionDue: number } | null;
}

/** Copy de cada evento: título corto + detalle (manual de marca, sin alarmismo). */
export function notificationCopy(n: Pick<AppNotification, 'type' | 'professionalName'>): { title: string; detail: string } {
  switch (n.type) {
    case 'CLIENT_QUOTE_RECEIVED':
      return {
        title: 'Nuevo presupuesto',
        detail: n.professionalName ? `${n.professionalName} te envió un presupuesto.` : 'Recibiste un presupuesto.',
      };
    case 'CLIENT_APPOINTMENT_PROPOSED':
      return { title: 'Nuevo horario propuesto', detail: 'El profesional propuso una fecha para tu trabajo.' };
    case 'CLIENT_APPOINTMENT_RESCHEDULED':
      return { title: 'Nuevo horario propuesto', detail: 'El profesional propuso otra fecha para tu trabajo.' };
    case 'PROFESSIONAL_SELECTED':
      return { title: 'Te eligieron', detail: 'El cliente aceptó tu presupuesto.' };
    case 'PRO_APPOINTMENT_CONFIRMED':
      return { title: 'Horario confirmado', detail: 'El cliente confirmó la fecha.' };
    case 'PRO_APPOINTMENT_DECLINED':
      return { title: 'Necesitan otro horario', detail: 'El cliente no puede en la fecha propuesta.' };
  }
}

/** Toast: "Nuevo presupuesto para “Problema eléctrico”." */
export function notificationToast(n: Pick<AppNotification, 'type' | 'requestTitle'>): string {
  const title = `“${n.requestTitle}”`;
  switch (n.type) {
    case 'CLIENT_QUOTE_RECEIVED':
      return `Nuevo presupuesto para ${title}.`;
    case 'CLIENT_APPOINTMENT_PROPOSED':
    case 'CLIENT_APPOINTMENT_RESCHEDULED':
      return `Nuevo horario propuesto para ${title}.`;
    case 'PROFESSIONAL_SELECTED':
      return `Te eligieron para ${title}.`;
    case 'PRO_APPOINTMENT_CONFIRMED':
      return `El cliente confirmó el horario de ${title}.`;
    case 'PRO_APPOINTMENT_DECLINED':
      return `Necesitan otro horario para ${title}.`;
  }
}

/** Novedad más relevante de una solicitud (para su tarjeta). null = nada nuevo. */
export function requestNews(items: readonly Pick<AppNotification, 'type'>[]): string | null {
  const quotes = items.filter((n) => n.type === 'CLIENT_QUOTE_RECEIVED').length;
  if (quotes > 1) return `${quotes} presupuestos nuevos`;
  if (quotes === 1) return 'Nuevo presupuesto';
  const latest = items[0];
  return latest ? notificationCopy({ type: latest.type, professionalName: null }).title : null;
}
