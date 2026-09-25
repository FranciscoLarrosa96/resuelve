import { Injectable, PLATFORM_ID, computed, effect, inject, signal, untracked } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { classifyError } from '../api/api-error';
import { RequestsApiService } from '../api/requests-api.service';
import {
  DEFAULT_PROBLEM_BY_SERVICE,
  DEFAULT_REQUEST_TEXT,
  INITIAL_DRAFT,
  SPOKEN_EXAMPLE,
} from '../data/catalog.data';
import { Service, ServiceRef } from '../models/category';
import { ProfessionalRef, ProfessionalSummary, toProfessionalRef } from '../models/professional';
import {
  CreateRequestPayload,
  MAX_INVITATIONS,
  REQUEST_LIMITS,
  RequestUrgency,
  ServiceRequest,
} from '../models/request';
import { URGENCY_LABELS } from '../models/request-status';
import { RequestStep, ServiceRequestDraft, ZoneRef } from '../models/service-request';
import { addDays, localIsoDate } from '../utils/dates';
import { interpretRequest } from '../utils/interpret-request';
import { joinNames } from '../utils/format';
import { CatalogStore } from './catalog.store';
import { RequestDraftStorage } from './request-draft.storage';

export const FLOW_STEPS = 5;

/** Destinatario: referencia mínima + lo público que muestra el resumen del pedido. */
export interface RecipientRef extends ProfessionalRef {
  averageRating: number | null;
  reviewsCount: number;
  availableToday: boolean;
}

function toRecipient(p: ProfessionalSummary): RecipientRef {
  return {
    ...toProfessionalRef(p),
    averageRating: p.averageRating,
    reviewsCount: p.reviewsCount,
    availableToday: p.availableToday,
  };
}

let draftSequence = 0;
/** Id local del borrador (el id definitivo lo asigna el backend al crearlo). */
function newDraftId(): string {
  return `draft-${Date.now().toString(36)}-${++draftSequence}`;
}

/** Título por defecto de un servicio elegido directamente ("Problema eléctrico"). */
function defaultTitle(service: ServiceRef): string {
  return DEFAULT_PROBLEM_BY_SERVICE[service.slug] ?? (service.name || 'Consulta general');
}

function toRef(service: Service): ServiceRef {
  return { id: service.id, slug: service.slug, name: service.name };
}

/** Qué falta para poder enviar (se muestra antes de llamar al backend). */
export type DraftIssue = 'service' | 'zone' | 'title' | 'description' | 'recipients';

/** Mensajes de error del envío. Salen de status/code, nunca del `message` del backend. */
export function sendErrorMessage(error: unknown): string {
  const e = classifyError(error);
  switch (e.code) {
    case 'INVITATION_LIMIT_REACHED':
      return `Podés pedir presupuesto a ${MAX_INVITATIONS} profesionales como máximo.`;
    case 'PROFESSIONAL_NOT_ELIGIBLE':
      return 'Uno de los profesionales ya no puede tomar este pedido (no ofrece el servicio o hoy no está disponible). Quitalo y probá de nuevo.';
    case 'CANNOT_INVITE_SELF':
      return 'No podés pedirte presupuesto a vos mismo.';
    case 'INVALID_REQUEST_STATE':
      return 'Esta solicitud ya no admite cambios. Revisala en Mis solicitudes.';
  }
  switch (e.kind) {
    case 'validation':
      return 'Revisá los datos del pedido: hay algo que el servidor no aceptó.';
    case 'rate-limited':
      return 'Hiciste muchos intentos seguidos. Esperá un momento y probá de nuevo.';
    case 'not-found':
      return 'No encontramos alguno de los datos del pedido. Revisalo y volvé a enviarlo.';
    case 'network':
    case 'server':
      return 'No pudimos enviar tu solicitud. Revisá tu conexión y volvé a intentar.';
    default:
      return 'No pudimos enviar tu solicitud. Probá de nuevo.';
  }
}

/**
 * El pedido del cliente. Se arma en el Home / servicios / perfiles y viaja
 * por: solicitud → resultados → perfil → presupuesto → confirmación.
 *
 * Borrador: vive en memoria y se copia a sessionStorage (solo lo no
 * sensible, ver RequestDraftStorage) para sobrevivir un F5 o el paso por
 * /ingresar. Envío: POST /requests (DRAFT) + POST /requests/:id/invitations
 * (→ WAITING_QUOTES). Si la creación salió bien y la invitación no, se
 * recuerda el id creado para reintentar SOLO la invitación: nunca se crean
 * dos solicitudes por el mismo pedido.
 */
@Injectable({ providedIn: 'root' })
export class RequestStore {
  private readonly catalog = inject(CatalogStore);
  private readonly api = inject(RequestsApiService);
  private readonly storage = inject(RequestDraftStorage);

  // ---- Home: texto libre + "Hablar" ---------------------------------
  readonly homeText = signal('');
  readonly listening = signal(false);
  private speakTimer?: ReturnType<typeof setInterval>;

  // ---- Pedido --------------------------------------------------------
  readonly draft = signal<ServiceRequestDraft>(INITIAL_DRAFT);
  readonly urgencyLabel = computed(() => URGENCY_LABELS[this.draft().urgency]);
  /** Servicio del pedido en el catálogo real (undefined hasta que carga). */
  readonly service = computed(() => this.catalog.serviceBySlug(this.draft().service.slug));
  readonly serviceName = computed(() => this.service()?.name ?? this.draft().service.name);
  readonly zoneName = computed(() => this.draft().zone?.name ?? 'Barrio sin elegir');

  // ---- Flujo "Crear solicitud" -------------------------------------
  readonly step = signal<RequestStep>(0);
  readonly analyzing = signal(false);
  readonly changingCategory = signal(false);
  readonly showDates = signal(false);
  readonly progress = computed(() => ((this.step() + 1) / FLOW_STEPS) * 100);
  private analyzeTimer?: ReturnType<typeof setTimeout>;
  private advanceTimer?: ReturnType<typeof setTimeout>;

  // ---- Solicitud de presupuesto ------------------------------------
  /** Profesionales REALES a los que se pedirá presupuesto (UUID del backend). Máx. 3. */
  readonly recipients = signal<RecipientRef[]>([]);
  readonly recipientIds = computed(() => this.recipients().map((p) => p.id));
  readonly recipientNames = computed(() => joinNames(this.recipients().map((p) => p.firstName)));
  readonly canAddRecipient = computed(() => this.recipients().length < MAX_INVITATIONS);
  /** Dirección exacta (opcional). Solo en memoria: NO se persiste. */
  readonly exactAddress = signal('');
  readonly sending = signal(false);
  readonly sendError = signal<string | null>(null);
  /** Solicitud ya creada (DRAFT) cuya invitación falló: se reintenta sin crear otra. */
  readonly pendingRequestId = signal<string | null>(null);
  /** Respuesta real del último envío (pantalla de confirmación). */
  readonly lastCreated = signal<ServiceRequest | null>(null);

  /** Qué falta para enviar. Vacío = listo. */
  readonly issues = computed<DraftIssue[]>(() => {
    const d = this.draft();
    const issues: DraftIssue[] = [];
    if (!d.service.id) issues.push('service');
    if (!d.zone) issues.push('zone');
    if (d.title.trim().length < REQUEST_LIMITS.titleMin) issues.push('title');
    if (d.description.trim().length < REQUEST_LIMITS.descriptionMin) issues.push('description');
    if (!this.recipients().length) issues.push('recipients');
    return issues;
  });

  constructor() {
    // Los servicios detectados por texto se guardan por slug; cuando el
    // catálogo está cargado se completa el id real y el nombre.
    effect(() => {
      const service = this.service();
      if (!service) return;
      untracked(() => {
        const current = this.draft().service;
        if (current.id !== service.id || current.name !== service.name) {
          this.draft.update((d) => ({ ...d, service: toRef(service) }));
        }
      });
    });

    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    const stored = this.storage.read();
    if (stored) {
      this.draft.set(stored.draft);
      this.recipients.set(stored.recipients);
      this.pendingRequestId.set(stored.pendingRequestId);
      this.step.set((FLOW_STEPS - 1) as RequestStep);
    }
    // Copia el borrador a sessionStorage en cada cambio (el inicial no se guarda).
    effect(() => {
      const draft = this.draft();
      const recipients = this.recipients();
      const pendingRequestId = this.pendingRequestId();
      if (draft.id === INITIAL_DRAFT.id) return;
      untracked(() => this.storage.write({ draft, recipients, pendingRequestId }));
    });
  }

  // ---- Home ----------------------------------------------------------
  setHomeText(text: string): void {
    this.homeText.set(text);
  }

  /** Simula dictado por voz escribiendo una frase de ejemplo. */
  speak(): void {
    if (this.listening()) return;
    this.listening.set(true);
    this.homeText.set('');
    let i = 0;
    clearInterval(this.speakTimer);
    this.speakTimer = setInterval(() => {
      i += 2;
      this.homeText.set(SPOKEN_EXAMPLE.slice(0, i));
      if (i >= SPOKEN_EXAMPLE.length) {
        clearInterval(this.speakTimer);
        this.listening.set(false);
      }
    }, 45);
  }

  /** "Encontrar profesionales": interpreta el texto y arranca el flujo. */
  startFromHome(): void {
    const text = this.homeText().trim() || DEFAULT_REQUEST_TEXT;
    const { serviceSlug, problem } = interpretRequest(text);
    this.resetForNewRequest();
    this.draft.update((d) => ({
      ...d,
      description: text,
      service: this.refFor(serviceSlug),
      title: problem,
    }));
    this.analyzing.set(true);
    clearTimeout(this.analyzeTimer);
    this.analyzeTimer = setTimeout(() => this.analyzing.set(false), 1400);
  }

  /** Elegir un servicio del catálogo (Servicios más pedidos / /servicios / "Cambiar servicio"). */
  setService(service: Service): void {
    const ref = toRef(service);
    this.draft.update((d) => ({ ...d, service: ref, title: defaultTitle(ref) }));
    this.changingCategory.set(false);
  }

  /** Resumen corto editable. Vacío no se acepta: se conserva el anterior. */
  updateTitle(title: string): void {
    const clean = title.trim().slice(0, REQUEST_LIMITS.titleMax);
    if (clean) this.draft.update((d) => ({ ...d, title: clean }));
  }

  /**
   * Descripción editable. Si el texto nuevo corresponde claramente a otro
   * servicio, se actualizan servicio y título y se vuelve al paso de
   * detección para que el cliente lo confirme. Devuelve true si cambió el servicio.
   */
  updateDescription(text: string, redetect = true): boolean {
    const description = text.trim().slice(0, REQUEST_LIMITS.descriptionMax);
    this.draft.update((d) => ({ ...d, description }));
    if (!description || !redetect) return false;
    const detected = interpretRequest(description);
    if (!detected.matched || detected.serviceSlug === this.draft().service.slug) return false;
    this.draft.update((d) => ({ ...d, service: this.refFor(detected.serviceSlug), title: detected.problem }));
    this.changingCategory.set(false);
    this.goToStep(0);
    return true;
  }

  setZone(zone: ZoneRef, advance = false): void {
    this.updateDraft({ zone: { id: zone.id, name: zone.name } }, advance);
  }

  /**
   * "Crear solicitud similar": borrador NUEVO con título, descripción,
   * servicio y zona de una solicitud anterior. Lleva a "Revisá tu pedido".
   */
  repeatFrom(request: ServiceRequest): void {
    this.resetForNewRequest();
    const slug = request.service.slug ?? '';
    this.draft.update((d) => ({
      ...d,
      sourceRequestId: request.id,
      title: request.title,
      description: request.description,
      service: this.refFor(slug, { id: request.service.id, slug, name: request.service.name ?? '' }),
      zone: request.zone.name ? { id: request.zone.id, name: request.zone.name } : null,
    }));
    this.step.set((FLOW_STEPS - 1) as RequestStep);
  }

  // ---- Flujo ---------------------------------------------------------
  /**
   * Urgencia y fecha se mantienen coherentes: URGENT/TODAY implican hoy; una
   * fecha que no es hoy implica "Puede esperar".
   */
  updateDraft(patch: Partial<ServiceRequestDraft>, advance = false): void {
    const today = localIsoDate(new Date());
    this.draft.update((d) => {
      const next = { ...d, ...patch };
      if (patch.urgency === 'URGENT') Object.assign(next, { when: 'Ahora', desiredDate: today });
      else if (patch.urgency === 'TODAY') Object.assign(next, { when: 'Hoy', desiredDate: today });
      else if (patch.urgency === 'FLEXIBLE' && d.urgency === 'URGENT') Object.assign(next, { when: 'Hoy', desiredDate: today });
      else if (patch.desiredDate !== undefined && patch.desiredDate !== today) next.urgency = 'FLEXIBLE';
      else if (patch.desiredDate !== undefined && d.urgency === 'URGENT') next.urgency = 'TODAY';
      return next;
    });
    if (advance) {
      clearTimeout(this.advanceTimer);
      this.advanceTimer = setTimeout(() => this.next(), 280);
    }
  }

  /** Opciones de "Cuándo" relativas a hoy (fecha real). */
  whenFor(offsetDays: number): { when: string; desiredDate: string } {
    const date = addDays(new Date(), offsetDays);
    return { when: offsetDays === 0 ? 'Hoy' : offsetDays === 1 ? 'Mañana' : '', desiredDate: localIsoDate(date) };
  }

  next(): void {
    this.step.update((s) => Math.min(FLOW_STEPS - 1, s + 1) as RequestStep);
    this.changingCategory.set(false);
  }

  previous(): void {
    this.step.update((s) => Math.max(0, s - 1) as RequestStep);
  }

  goToStep(step: RequestStep): void {
    clearTimeout(this.advanceTimer);
    this.analyzing.set(false);
    this.step.set(step);
  }

  // ---- Presupuesto ---------------------------------------------------
  askProfessionals(pros: ProfessionalSummary[]): void {
    const unique = pros.filter((p, i) => pros.findIndex((x) => x.id === p.id) === i);
    this.recipients.set(unique.slice(0, MAX_INVITATIONS).map(toRecipient));
    this.sendError.set(null);
  }

  addRecipient(pro: ProfessionalSummary): void {
    this.recipients.update((list) =>
      list.some((p) => p.id === pro.id) || list.length >= MAX_INVITATIONS ? list : [...list, toRecipient(pro)],
    );
  }

  removeRecipient(id: string): void {
    this.recipients.update((list) => (list.length > 1 ? list.filter((p) => p.id !== id) : list));
    this.sendError.set(null);
  }

  /** Payload del backend: solo ids reales y textos. Nunca estado ni nombres como autoridad. */
  buildPayload(): CreateRequestPayload | null {
    const d = this.draft();
    if (!d.service.id || !d.zone) return null;
    const address = this.exactAddress().trim().slice(0, REQUEST_LIMITS.addressMax);
    return {
      serviceId: d.service.id,
      zoneId: d.zone.id,
      title: d.title.trim(),
      description: d.description.trim(),
      urgency: d.urgency as RequestUrgency,
      ...(d.desiredDate ? { desiredDate: d.desiredDate } : {}),
      ...(address ? { exactAddress: address } : {}),
    };
  }

  /**
   * Envía la solicitud. Sin reintentos automáticos (los POST no son
   * idempotentes): el botón queda deshabilitado mientras `sending`.
   * Devuelve la solicitud real o null si no se pudo.
   */
  async send(): Promise<ServiceRequest | null> {
    if (this.sending()) return null;
    const payload = this.buildPayload();
    const ids = this.recipientIds();
    if (!payload || this.issues().length || !ids.length) return null;
    this.sending.set(true);
    this.sendError.set(null);
    try {
      let id = this.pendingRequestId();
      if (id) {
        // Ya existe (la invitación había fallado): se actualiza con lo último y se reintenta invitar.
        await firstValueFrom(this.api.updateRequest(id, payload));
      } else {
        id = (await firstValueFrom(this.api.createRequest(payload))).id;
        this.pendingRequestId.set(id);
      }
      const sent = await firstValueFrom(this.api.inviteProfessionals(id, ids));
      this.lastCreated.set(sent);
      this.finish();
      return sent;
    } catch (error) {
      const e = classifyError(error);
      // La solicitud pendiente ya no es usable (de otra cuenta, cancelada…): el próximo intento crea otra.
      if (this.pendingRequestId() && (e.kind === 'not-found' || e.code === 'INVALID_REQUEST_STATE')) {
        this.pendingRequestId.set(null);
      }
      this.sendError.set(sendErrorMessage(error));
      return null;
    } finally {
      this.sending.set(false);
    }
  }

  /** Borrador enviado: se limpia de memoria y de sessionStorage. */
  private finish(): void {
    this.storage.clear();
    this.clearDraftState();
    this.draft.set({ ...INITIAL_DRAFT });
  }

  /** "Descartar pedido": vuelve al borrador inicial y lo borra de sessionStorage. */
  discard(): void {
    this.storage.clear();
    this.clearDraftState();
    this.draft.set({ ...INITIAL_DRAFT });
  }

  resetForNewRequest(): void {
    this.clearDraftState();
    this.homeText.set('');
    // Borrador nuevo: sin la descripción de ejemplo. Conserva el barrio elegido.
    this.draft.set({
      ...INITIAL_DRAFT,
      id: newDraftId(),
      description: '',
      title: defaultTitle(INITIAL_DRAFT.service),
      zone: this.draft().zone,
    });
    this.lastCreated.set(null);
  }

  private clearDraftState(): void {
    clearTimeout(this.analyzeTimer);
    clearTimeout(this.advanceTimer);
    clearInterval(this.speakTimer);
    this.listening.set(false);
    this.step.set(0);
    this.analyzing.set(false);
    this.changingCategory.set(false);
    this.showDates.set(false);
    this.recipients.set([]);
    this.exactAddress.set('');
    this.sendError.set(null);
    this.pendingRequestId.set(null);
  }

  /** Referencia a un servicio por slug, con id y nombre reales si el catálogo ya cargó. */
  private refFor(slug: string, fallback?: ServiceRef): ServiceRef {
    const service = this.catalog.serviceBySlug(slug);
    return service ? toRef(service) : fallback ?? { id: null, slug, name: '' };
  }
}
