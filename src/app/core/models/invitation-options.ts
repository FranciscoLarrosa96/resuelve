import { ProfessionalSummary } from './professional';

/**
 * "Sumar profesionales" a un pedido enviado y sin presupuestos (`GET /requests/:id/invitation-options`).
 * Todo lo decide el backend (estado, lugares, quién puede responder); la UI no lo recalcula.
 */
export type InvitationOptionsState =
  | 'AVAILABLE'
  | 'LIMIT_REACHED'
  | 'NO_CANDIDATES'
  | 'QUOTES_FULL'
  /** No corresponde ofrecerlo (sin enviar, con presupuestos, cancelado…): no se muestra nada. */
  | 'NOT_APPLICABLE';

export interface InvitationOptions {
  requestId: string;
  state: InvitationOptionsState;
  /** Hoy / urgente: orientación desde el inicio. SUGGEST: pasó el umbral sin presupuestos. */
  emphasis: 'NONE' | 'SUGGEST' | 'URGENT_GUIDE';
  urgent: boolean;
  invited: number;
  maxInvitations: number;
  remainingInvitations: number;
  activeQuotes: number;
  maxActiveQuotes: number;
  waitingMinutes: number | null;
  /** Umbral inicial para destacar la sugerencia (para medir; lo fija el backend). */
  suggestAfterMinutes: number;
  /** Cuándo pasa a destacarse (ISO); la pantalla relee una sola vez en ese momento. */
  suggestFrom: string | null;
  /** Pueden recibir Y responder esta invitación (misma regla que el backend al enviar). */
  candidates: ProfessionalSummary[];
  /** Con WhatsApp o llamadas habilitados, aunque no puedan responder por Resuelve. */
  directContacts: (ProfessionalSummary & { invited?: boolean })[];
}
