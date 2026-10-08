export type JobStatus = 'TO_COORDINATE' | 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export interface JobClientShort {
  firstName: string;
  lastInitial: string;
}

export interface JobListItem {
  id: string;
  requestId: string;
  status: JobStatus;
  scheduledDate: string | null;
  scheduledTime: string | null;
  durationMinutes: number | null;
  /** Desde cuándo se puede finalizar (fin del horario pactado). Null si no está agendado. */
  closesAt?: string | null;
  /** Lo decide el backend: terminó el horario y el trabajo sigue abierto. */
  canComplete?: boolean;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  title: string;
  service: { name: string };
  zone: { name: string };
  client: JobClientShort;
}

export interface JobChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface JobHistoryEvent {
  id: string;
  type: string;
  details: Record<string, unknown>;
  actor: string;
  createdAt: string;
}

export interface JobDetail extends Omit<JobListItem, 'client'> {
  acceptedQuoteId: string;
  clientId: string;
  description: string;
  urgency: 'FLEXIBLE' | 'TODAY' | 'URGENT';
  requestStatus: string;
  service: { id: string; name: string };
  zone: { id: string; name: string };
  client: JobClientShort & { fullName: string; phone: string | null; exactAddress: string | null };
  acceptedQuote: import('./quote').Quote;
  privateNotes: string;
  checklist: JobChecklistItem[];
  history: JobHistoryEvent[];
  /** "Historial con este cliente": trabajos realizados anteriores con él. Null si es la primera vez. */
  clientHistory?: { completedJobs: number; lastCompletedAt: string | null } | null;
  /** El cliente ya reseñó este trabajo: no se le vuelve a pedir. */
  clientReviewed?: boolean;
}

export interface JobsResponse {
  items: JobListItem[];
  counts: { toCoordinate: number; today: number; inProgress: number; completed: number };
}

export interface ScheduleJobPayload {
  scheduledDate: string;
  scheduledTime?: string;
  durationMinutes?: number;
}
