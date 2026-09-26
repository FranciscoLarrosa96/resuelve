import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, input, signal, untracked, viewChildren } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { APPOINTMENT_DURATIONS } from '../../../core/models/agenda';
import { Appointment } from '../../../core/models/request';
import { AgendaStore } from '../../../core/state/agenda.store';
import { ProRequestsStore } from '../../../core/state/pro-requests.store';
import { businessClock, businessDay, businessInstant, shiftDay } from '../../../core/utils/business-time';
import { ToastService } from '../../../core/services/toast.service';
import { formatTimestamp } from '../../../core/utils/dates';
import { onTabVisible } from '../../../core/utils/on-tab-visible';
import { BackButton } from '../../../shared/components/back-button/back-button';
import { Dialog } from '../../../shared/components/dialog/dialog';
import { Icon } from '../../../shared/components/icon/icon';
import { SessionPending } from '../../../shared/components/session-pending/session-pending';
import {
  PRO_STATE_TONES,
  appointmentSlot,
  clientName,
  othersText,
  proCoordination,
  proPersonalState,
  proRequestActions,
  urgencyLabel,
  whenText,
} from '../pro-ui';

interface ProposeForm {
  title: string;
  hint: string;
  /** Cita activa que se reemplaza (null = primera propuesta o después de un rechazo). */
  replaces: Appointment | null;
}

/**
 * Detalle REAL para el profesional invitado. Muestra solo lo que manda el
 * backend: sin dirección ni teléfono hasta que el cliente lo elige
 * (`contact` deja de ser null recién ahí).
 */
@Component({
  selector: 'app-pro-request-detail-page',
  imports: [NgTemplateOutlet, RouterLink, BackButton, Dialog, Icon, SessionPending],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pro-request-detail-page.html',
})
export class ProRequestDetailPage {
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly agenda = inject(AgendaStore);
  protected readonly store = inject(ProRequestsStore);

  /** Parámetro de ruta :id */
  readonly id = input.required<string>();

  protected readonly req = computed(() => {
    const r = this.store.detail();
    return r && r.id === this.id() ? r : null;
  });
  protected readonly actions = computed(() => (this.req() ? proRequestActions(this.req()!) : null));
  /** Estado personal (ganador / no elegido / enviado…), no el global. */
  protected readonly personal = computed(() => (this.req() ? proPersonalState(this.req()!) : null));
  protected readonly stateTone = PRO_STATE_TONES;
  /** Coordinación del trabajo: solo para el profesional elegido y mientras sigue activo. */
  protected readonly coord = computed(() => (this.req() ? proCoordination(this.req()!) : null));
  /** Horario de la cita activa (propuesta o confirmada). */
  protected readonly slot = computed(() => {
    const a = this.req()?.appointment;
    if (!a || (a.status !== 'PROPOSED' && a.status !== 'CONFIRMED')) return null;
    return { ...appointmentSlot(a), note: a.note, confirmed: a.status === 'CONFIRMED', appointment: a };
  });

  // ---- Propuesta de fecha y horario ---------------------------------------
  protected readonly durations = APPOINTMENT_DURATIONS;
  protected readonly proposing = signal<ProposeForm | null>(null);
  protected readonly formDate = signal('');
  protected readonly formTime = signal('');
  protected readonly formDuration = signal(60);
  protected readonly formNote = signal('');
  protected readonly formError = signal<string | null>(null);
  protected readonly minDate = signal(businessDay());
  protected readonly saving = computed(() => this.store.appointmentAction() === 'propose');
  protected readonly completing = signal(false);
  /** Aviso de privacidad solo mientras todavía puede ser elegido. */
  protected readonly privacyNote = computed(() => {
    const r = this.req();
    return !!r && !r.contact && (this.personal()?.tone === 'new' || this.personal()?.tone === 'waiting');
  });
  protected readonly urgency = urgencyLabel;
  protected readonly others = othersText;
  protected readonly client = clientName;
  protected readonly when = whenText;
  protected readonly date = formatTimestamp;

  private readonly alerts = viewChildren<ElementRef<HTMLElement>>('actionAlert');

  constructor() {
    effect(() => {
      const id = this.id();
      if (this.store.hasProfile()) untracked(() => this.store.loadDetail(id, true));
    });
    onTabVisible(() => this.store.loadDetail(this.id(), true));
  }

  protected backToList(): void {
    this.router.navigate(['/pro/solicitudes']);
  }

  protected retry(): void {
    this.store.loadDetail(this.id(), true);
  }

  protected openPropose(replaces: Appointment | null): void {
    const r = this.req();
    if (!r) return;
    const today = businessDay();
    this.minDate.set(today);
    if (replaces) {
      this.formDate.set(businessDay(replaces.startsAt));
      this.formTime.set(businessClock(replaces.startsAt));
      this.formDuration.set(replaces.durationMinutes);
      this.formNote.set(replaces.note ?? '');
    } else {
      // Punto de partida razonable: el día que pidió el cliente (si no pasó) o mañana.
      this.formDate.set(r.desiredDate && r.desiredDate > today ? r.desiredDate : shiftDay(today, 1));
      this.formTime.set('09:00');
      this.formDuration.set(60);
      this.formNote.set('');
    }
    this.formError.set(null);
    this.store.clearProposeError();
    const rescheduling = replaces?.status === 'CONFIRMED';
    this.proposing.set({
      title: rescheduling ? 'Reprogramar trabajo' : replaces ? 'Cambiar propuesta' : 'Proponer fecha y horario',
      hint: rescheduling
        ? 'El horario confirmado se cancela y el cliente tiene que confirmar el nuevo.'
        : 'El cliente la confirma desde Resuelve. Si querés, hablalo antes por teléfono.',
      replaces,
    });
  }

  protected closePropose(): void {
    if (!this.saving()) this.proposing.set(null);
  }

  protected async submitPropose(): Promise<void> {
    const form = this.proposing();
    if (!form || this.saving()) return;
    const date = this.formDate();
    const time = this.formTime();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
      this.formError.set('Elegí la fecha y la hora.');
      return;
    }
    const startsAt = businessInstant(date, time);
    if (new Date(startsAt).getTime() <= Date.now()) {
      this.formError.set('Elegí una fecha y hora futuras.');
      return;
    }
    this.formError.set(null);
    const note = this.formNote().trim();
    const result = await this.store.propose(this.id(), {
      startsAt,
      durationMinutes: this.formDuration(),
      ...(note ? { note } : {}),
      ...(form.replaces ? { replacesAppointmentId: form.replaces.id } : {}),
    });
    if (result === 'error') return;
    this.proposing.set(null);
    if (result === 'ok') this.toast.show('Propuesta enviada. Te avisamos acá cuando el cliente responda.');
    else this.focusAlert();
  }

  // ---- Trabajo realizado ---------------------------------------------------
  protected askComplete(): void {
    this.completing.set(true);
  }

  protected closeComplete(): void {
    if (this.store.appointmentAction() !== 'complete') this.completing.set(false);
  }

  protected async confirmComplete(): Promise<void> {
    const ok = await this.store.complete(this.id());
    this.completing.set(false);
    if (ok) this.toast.show('Listo. El trabajo quedó registrado como realizado.');
    else this.focusAlert();
  }

  /** "Ver en agenda": abre la semana del trabajo. */
  protected showInAgenda(a: Appointment): void {
    this.agenda.showDay(businessDay(a.startsAt));
  }

  protected async decline(): Promise<void> {
    const ok = await this.store.decline(this.id());
    if (ok) this.toast.show('Listo. Marcaste que no estás disponible para este pedido.');
    else this.focusAlert();
  }

  private focusAlert(): void {
    setTimeout(() => this.alerts().find((e) => e.nativeElement.offsetParent)?.nativeElement.focus());
  }
}
