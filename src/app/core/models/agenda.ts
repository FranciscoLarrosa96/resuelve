import { AppointmentStatus } from './request';

/**
 * Ítem de la agenda (GET /pro/appointments). Solo lo necesario para la
 * grilla: sin teléfono ni dirección (eso está en el detalle de la solicitud).
 */
export interface AgendaItem {
  id: string;
  requestId: string;
  /** La agenda trae PROPOSED, CONFIRMED y COMPLETED (canceladas y rechazadas no). */
  status: AppointmentStatus;
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  title: string;
  service: { id: string; name: string };
  zone: { id: string; name: string };
  client: { firstName: string; lastInitial: string };
}

/** POST /pro/requests/:id/appointments */
export interface ProposeAppointmentPayload {
  /** ISO con la zona de Argentina: "2026-09-28T10:00:00-03:00". */
  startsAt: string;
  durationMinutes: number;
  note?: string;
  /** Cita activa que se reemplaza ("Cambiar propuesta" / "Reprogramar"). */
  replacesAppointmentId?: string;
}

/** Duraciones que ofrece el formulario (APPOINTMENT_DURATIONS del backend). */
export const APPOINTMENT_DURATIONS: { minutes: number; label: string }[] = [
  { minutes: 30, label: '30 min' },
  { minutes: 60, label: '1 h' },
  { minutes: 90, label: '1 h 30' },
  { minutes: 120, label: '2 h' },
  { minutes: 180, label: '3 h' },
  { minutes: 240, label: '4 h' },
  { minutes: 360, label: '6 h' },
  { minutes: 480, label: '8 h' },
];
