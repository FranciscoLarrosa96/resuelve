import { RequestStatus } from '../requests/request.enums';
import { AppointmentStatus } from './appointment.entity';
import { isCompletionDue } from './completion';

describe('isCompletionDue (pendiente de cierre)', () => {
  const now = new Date('2026-09-28T15:00:00Z');
  const ended = { status: AppointmentStatus.CONFIRMED, scheduledEnd: new Date('2026-09-28T14:59:00Z') };

  it('cita confirmada terminada + solicitud SCHEDULED → pendiente', () => {
    expect(isCompletionDue(RequestStatus.SCHEDULED, ended, now)).toBe(true);
    // Justo en el horario de fin ya se puede cerrar.
    expect(isCompletionDue(RequestStatus.SCHEDULED, { ...ended, scheduledEnd: now }, now)).toBe(true);
  });

  it('antes del fin, sin cita, con la cita propuesta o con el trabajo ya cerrado → no', () => {
    const future = { ...ended, scheduledEnd: new Date('2026-09-28T15:01:00Z') };
    expect(isCompletionDue(RequestStatus.SCHEDULED, future, now)).toBe(false);
    expect(isCompletionDue(RequestStatus.SCHEDULED, null, now)).toBe(false);
    expect(
      isCompletionDue(RequestStatus.SCHEDULED, { ...ended, status: AppointmentStatus.PROPOSED }, now),
    ).toBe(false);
    expect(
      isCompletionDue(RequestStatus.COMPLETED, { ...ended, status: AppointmentStatus.COMPLETED }, now),
    ).toBe(false);
    expect(isCompletionDue(RequestStatus.PROFESSIONAL_SELECTED, ended, now)).toBe(false);
  });
});
