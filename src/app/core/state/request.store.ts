import { Injectable, PLATFORM_ID, computed, effect, inject, signal, untracked } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { classifyError } from '../api/api-error';
import { RequestsApiService } from '../api/requests-api.service';
import { DEFAULT_PROBLEM_BY_SERVICE, INITIAL_DRAFT } from '../data/catalog.data';
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
import { RequestFlowMode, RequestStep, ServiceRequestDraft, ZoneRef } from '../models/service-request';
import { businessDay, shiftDay } from '../utils/business-time';
import { formatDesiredDate } from '../utils/dates';
import { CatalogEntry, SERVICE_TERMS, interpretRequest } from '../utils/interpret-request';
import { joinNames } from '../utils/format';
import { CatalogStore } from './catalog.store';
import { RequestDraftStorage } from './request-draft.storage';

export const FLOW_STEPS = 5;

/**
 * Destinatario: referencia mínima + lo público que muestra el resumen del
 * pedido y lo necesario para saber si sigue pudiendo recibirlo después de
 * editar (servicios que ofrece — los regulados, solo con matrícula vigente —,
 * cobertura). Todo es del contrato público; el backend lo revalida al enviar.
 */
export interface RecipientRef extends ProfessionalRef {
  averageRating: number | null;
  reviewsCount: number;
  availableToday: boolean;
  /** Ausentes en borradores guardados por una versión anterior: entonces solo decide el backend. */
  serviceIds?: string[];
  coversEntireCity?: boolean;
  zoneIds?: string[];
}

function toRecipient(p: ProfessionalSummary): RecipientRef {
  return {
    ...toProfessionalRef(p),
    averageRating: p.averageRating,
    reviewsCount: p.reviewsCount,
    availableToday: p.availableToday,
    serviceIds: p.services.map((s) => s.id),
    coversEntireCity: p.coversEntireCity,
    zoneIds: p.zones.map((z) => z.id),
  };
}

/** Por qué un profesional elegido ya no puede recibir el pedido tal como quedó. */
export type TargetIssue = 'service' | 'zone' | 'availability';

export interface TargetProblem {
  professional: RecipientRef;
  issue: TargetIssue;
}

/**
 * Misma regla que el backend al invitar (`requestIneligibility` + urgencias
 * solo con "Disponible hoy"), con los datos públicos que ya tenemos. Sin datos
 * (borrador viejo) no se afirma nada: decide el backend al enviar.
 */
export function recipientIssue(p: RecipientRef, d: ServiceRequestDraft): TargetIssue | null {
  if (p.serviceIds && d.service.id && !p.serviceIds.includes(d.service.id)) return 'service';
  if (d.zone && p.coversEntireCity === false && p.zoneIds && !p.zoneIds.includes(d.zone.id)) return 'zone';
  if (d.urgency === 'URGENT' && !p.availableToday) return 'availability';
  return null;
}

/** Por qué el profesional elegido dejó de poder recibir el pedido (texto para el cliente). */
export function targetIssueText(name: string, issue: TargetIssue, service: string, zone: string | null, licensed: boolean): string {
  switch (issue) {
    case 'service':
      return licensed ? `${name} no ofrece ${service} con matrícula verificada.` : `${name} no ofrece ${service}.`;
    case 'zone':
      return `${name} no trabaja en ${zone ?? 'ese barrio'}.`;
    case 'availability':
      return `${name} no marcó que puede trabajar hoy, y las urgencias solo llegan a quien está disponible.`;
  }
}

/** "Reparación de PC" y "Reparación de PC" → una sola vez (sin tildes ni mayúsculas). */
export function serviceAndTitle(service: string, title: string): string {
  const norm = (x: string) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  if (!title.trim() || norm(service) === norm(title)) return service || title;
  if (!service) return title;
  return `${service} · ${title}`;
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
export type DraftIssue = 'service' | 'zone' | 'title' | 'description' | 'recipients' | 'target';

/** Mensajes de error del envío. Salen de status/code, nunca del `message` del backend. */
export function sendErrorMessage(error: unknown): string {
  const e = classifyError(error);
  switch (e.code) {
    case 'INVITATION_LIMIT_REACHED':
      return `Podés pedir presupuesto a ${MAX_INVITATIONS} profesionales como máximo.`;
    case 'PROFESSIONAL_NOT_ELIGIBLE':
      return 'Un profesional elegido ya no puede recibir este pedido (dejó de ofrecer el servicio, no trabaja en ese barrio o hoy no está disponible para urgencias). Podés buscar otro profesional: tu pedido queda guardado.';
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

  // ---- Home: texto libre --------------------------------------------
  readonly homeText = signal('');

  // ---- Pedido --------------------------------------------------------
  readonly draft = signal<ServiceRequestDraft>(INITIAL_DRAFT);
  readonly urgencyLabel = computed(() => URGENCY_LABELS[this.draft().urgency]);
  /** Servicio del pedido en el catálogo real (undefined hasta que carga). */
  readonly service = computed(() => this.catalog.serviceBySlug(this.draft().service.slug));
  readonly serviceName = computed(() => this.service()?.name ?? this.draft().service.name);
  /** null = falta elegir (se muestra como pendiente, nunca como si estuviera completo). */
  readonly zoneName = computed(() => this.draft().zone?.name ?? null);
  /**
   * "Cuándo", derivado SIEMPRE de urgencia + `desiredDate` (día de Argentina):
   * "Ahora", "Hoy", "Mañana", "Dom 4/10" o "A coordinar" si no eligió fecha.
   */
  readonly whenLabel = computed(() => {
    const d = this.draft();
    if (d.urgency === 'URGENT') return 'Ahora';
    return d.desiredDate ? formatDesiredDate(d.desiredDate, businessDay()) : 'A coordinar';
  });
  /** "Reparación de PC · Pérdida…" sin repetir cuando título y servicio coinciden. */
  readonly problemLabel = computed(() => serviceAndTitle(this.serviceName(), this.draft().title));
  /**
   * Hay un pedido armado por el cliente (texto del Home, "Crear solicitud",
   * una solicitud repetida o uno dirigido a un profesional). El borrador
   * inicial no cuenta: nunca se muestra como "Tu pedido".
   */
  readonly hasContext = computed(() => {
    const d = this.draft();
    return d.id !== INITIAL_DRAFT.id && !!d.service.slug;
  });

  // ---- Contexto del flujo -------------------------------------------
  /** Explícito y persistido con el borrador (ver RequestFlowMode). */
  readonly flowMode = signal<RequestFlowMode>('DISCOVERY');
  /** TARGETED solo mientras haya a quién enviarlo. */
  readonly targeted = computed(() => this.flowMode() === 'TARGETED' && this.recipients().length > 0);
  /**
   * Profesionales elegidos que ya no pueden recibir el pedido con los cambios
   * que hizo el cliente (servicio, barrio o urgencia). Solo esto rompe el
   * flujo dirigido; editar fecha, título o descripción, nunca.
   */
  readonly targetProblems = computed<TargetProblem[]>(() => {
    if (!this.targeted()) return [];
    const d = this.draft();
    return this.recipients().flatMap((p) => {
      const issue = recipientIssue(p, d);
      return issue ? [{ professional: p, issue }] : [];
    });
  });
  /**
   * Se entró a editar desde "Solicitar presupuesto": al terminar se vuelve a
   * ESA pantalla. Es un destino interno fijo (nunca una URL), así que no hay
   * redirect abierto posible.
   */
  readonly returnToQuote = signal(false);
  /** Se abrió un paso desde "Revisá tu pedido": al elegir, se vuelve a la revisión. */
  private editingFromReview = false;

  // ---- Flujo "Crear solicitud" -------------------------------------
  readonly step = signal<RequestStep>(0);
  readonly analyzing = signal(false);
  readonly changingCategory = signal(false);
  /**
   * El texto no alcanzó para afirmar un servicio: opciones reales (0–3 slugs)
   * para que el cliente elija. null = se entendió (o todavía no se interpretó).
   */
  readonly uncertainOptions = signal<string[] | null>(null);
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
  /** El backend rechazó a un elegido al enviar (PROFESSIONAL_NOT_ELIGIBLE): se ofrece buscar otro. */
  readonly sendNotEligible = signal(false);
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
    else if (this.targetProblems().length) issues.push('target');
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
      this.flowMode.set(stored.flowMode);
      this.returnToQuote.set(stored.returnToQuote);
      this.step.set((FLOW_STEPS - 1) as RequestStep);
    }
    // Copia el borrador a sessionStorage en cada cambio (el inicial no se guarda).
    effect(() => {
      const draft = this.draft();
      const recipients = this.recipients();
      const pendingRequestId = this.pendingRequestId();
      const flowMode = this.flowMode();
      const returnToQuote = this.returnToQuote();
      if (draft.id === INITIAL_DRAFT.id) return;
      untracked(() => this.storage.write({ draft, recipients, pendingRequestId, flowMode, returnToQuote }));
    });
  }

  // ---- Home ----------------------------------------------------------
  setHomeText(text: string): void {
    this.homeText.set(text);
  }

  /**
   * "Encontrar profesionales": interpreta el texto REAL del cliente y arranca
   * el flujo. Sin texto no hace nada (nunca se completa con un ejemplo) y
   * devuelve false.
   */
  startFromHome(): boolean {
    const text = this.homeText().trim();
    if (!text) return false;
    const result = interpretRequest(text, this.catalogEntries());
    this.resetForNewRequest();
    if (result.kind === 'match') {
      this.draft.update((d) => ({ ...d, description: text, service: this.refFor(result.serviceSlug), title: result.problem }));
    } else {
      // Sin coincidencia fuerte NO se elige un servicio: el cliente lo confirma.
      this.draft.update((d) => ({ ...d, description: text, service: { ...INITIAL_DRAFT.service }, title: '' }));
      this.uncertainOptions.set(result.options);
      this.changingCategory.set(true);
    }
    this.analyzing.set(true);
    clearTimeout(this.analyzeTimer);
    this.analyzeTimer = setTimeout(() => this.analyzing.set(false), 900);
    return true;
  }

  /** Elegir un servicio del catálogo (Servicios más pedidos / /servicios / "Cambiar servicio"). */
  setService(service: Service): void {
    const ref = toRef(service);
    this.draft.update((d) => ({ ...d, service: ref, title: defaultTitle(ref) }));
    this.changingCategory.set(false);
    this.uncertainOptions.set(null);
  }

  // ---- Flujo dirigido --------------------------------------------------
  /** "Editar" desde "Solicitar presupuesto": abre la revisión y, al terminar, vuelve ahí. */
  editFromQuote(): void {
    this.returnToQuote.set(true);
    this.goToStep((FLOW_STEPS - 1) as RequestStep);
  }

  /** Terminó de editar y vuelve a "Solicitar presupuesto" (mismo borrador, mismos profesionales). */
  leaveToQuote(): void {
    this.returnToQuote.set(false);
    this.goToStep((FLOW_STEPS - 1) as RequestStep);
  }

  /**
   * "Cambiar profesional" / "Buscar profesionales": la ÚNICA forma de salir
   * del flujo dirigido. Conserva el pedido (textos, servicio, barrio, fecha)
   * y vuelve a buscar con él.
   */
  changeProfessional(): void {
    this.flowMode.set('DISCOVERY');
    this.recipients.set([]);
    this.returnToQuote.set(false);
    this.sendError.set(null);
    this.sendNotEligible.set(false);
    this.goToStep((FLOW_STEPS - 1) as RequestStep);
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
    const detected = interpretRequest(description, this.catalogEntries());
    if (detected.kind !== 'match' || detected.serviceSlug === this.draft().service.slug) return false;
    this.draft.update((d) => ({ ...d, service: this.refFor(detected.serviceSlug), title: detected.problem }));
    this.changingCategory.set(false);
    this.goToStep(0);
    return true;
  }

  setZone(zone: ZoneRef, advance = false): void {
    this.updateDraft({ zone: { id: zone.id, name: zone.name } }, advance);
  }

  /** Un barrio "detectado" que dejó de corresponder (otra dirección sin barrio reconocible). */
  clearZone(): void {
    this.draft.update((d) => ({ ...d, zone: null }));
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
   * Urgencia y fecha se mantienen coherentes (hoy = día de Argentina):
   * URGENT/TODAY implican hoy; elegir otro día implica "Puede esperar"; pasar
   * de urgencia a "Puede esperar" conserva hoy. Una fecha elegida NUNCA se
   * pisa con "hoy" por editar otra cosa.
   */
  updateDraft(patch: Partial<ServiceRequestDraft>, advance = false): void {
    const today = businessDay();
    this.draft.update((d) => {
      const next = { ...d, ...patch };
      if (patch.urgency === 'URGENT' || patch.urgency === 'TODAY') next.desiredDate = today;
      else if (patch.urgency === 'FLEXIBLE' && d.urgency === 'URGENT') next.desiredDate = today;
      else if (patch.desiredDate !== undefined && patch.desiredDate !== today) next.urgency = 'FLEXIBLE';
      else if (patch.desiredDate !== undefined && d.urgency === 'URGENT') next.urgency = 'TODAY';
      return next;
    });
    if (advance) {
      clearTimeout(this.advanceTimer);
      this.advanceTimer = setTimeout(() => this.next(), 280);
    }
  }

  /** Día de calendario (Argentina) a `offsetDays` de hoy, como `desiredDate`. */
  dateFor(offsetDays: number): string {
    return shiftDay(businessDay(), offsetDays);
  }

  /** Siguiente paso; si se entró a un paso desde la revisión, vuelve a la revisión. */
  next(): void {
    if (this.editingFromReview) {
      this.editingFromReview = false;
      this.step.set((FLOW_STEPS - 1) as RequestStep);
    } else {
      this.step.update((s) => Math.min(FLOW_STEPS - 1, s + 1) as RequestStep);
    }
    this.changingCategory.set(false);
  }

  previous(): void {
    if (this.editingFromReview) {
      this.editingFromReview = false;
      this.step.set((FLOW_STEPS - 1) as RequestStep);
      return;
    }
    this.step.update((s) => Math.max(0, s - 1) as RequestStep);
  }

  goToStep(step: RequestStep): void {
    clearTimeout(this.advanceTimer);
    this.analyzing.set(false);
    this.editingFromReview = false;
    this.step.set(step);
  }

  /** "Editar" una fila de "Revisá tu pedido": abre ese paso y, al elegir, vuelve a la revisión. */
  editStep(step: RequestStep): void {
    this.goToStep(step);
    this.editingFromReview = step !== FLOW_STEPS - 1;
  }

  // ---- Presupuesto ---------------------------------------------------
  /** Elegir a quién pedirle presupuesto: el pedido pasa a ser DIRIGIDO a esos profesionales. */
  askProfessionals(pros: ProfessionalSummary[]): void {
    const unique = pros.filter((p, i) => pros.findIndex((x) => x.id === p.id) === i);
    this.recipients.set(unique.slice(0, MAX_INVITATIONS).map(toRecipient));
    this.flowMode.set(unique.length ? 'TARGETED' : 'DISCOVERY');
    this.sendError.set(null);
  }

  /** ¿El pedido actual ya está dirigido exactamente a estos profesionales? */
  isTargetedTo(ids: readonly string[]): boolean {
    const current = this.recipientIds();
    return this.targeted() && current.length === ids.length && ids.every((id) => current.includes(id));
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
    this.sendNotEligible.set(false);
    try {
      let id = this.pendingRequestId();
      if (id) {
        // Ya existe (la invitación había fallado): se actualiza con lo último y se reintenta invitar.
        await firstValueFrom(this.api.updateRequest(id, payload));
      } else {
        id = (await firstValueFrom(this.api.createRequest(payload))).id;
        this.pendingRequestId.set(id);
      }
      const sent = await firstValueFrom(this.api.inviteProfessionals(id, ids, this.flowMode() === 'TARGETED'));
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
      this.sendNotEligible.set(e.code === 'PROFESSIONAL_NOT_ELIGIBLE');
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
    this.step.set(0);
    this.analyzing.set(false);
    this.changingCategory.set(false);
    this.uncertainOptions.set(null);
    this.showDates.set(false);
    this.recipients.set([]);
    this.flowMode.set('DISCOVERY');
    this.returnToQuote.set(false);
    this.editingFromReview = false;
    this.exactAddress.set('');
    this.sendError.set(null);
    this.sendNotEligible.set(false);
    this.pendingRequestId.set(null);
  }

  /** Catálogo real para clasificar; antes de que cargue, el vocabulario conocido (se completa el id después). */
  private catalogEntries(): CatalogEntry[] {
    const active = this.catalog.activeServices();
    return active.length
      ? active.map((s) => ({ slug: s.slug, name: s.name }))
      : Object.keys(SERVICE_TERMS).map((slug) => ({ slug, name: '' }));
  }

  /** Referencia a un servicio por slug, con id y nombre reales si el catálogo ya cargó. */
  private refFor(slug: string, fallback?: ServiceRef): ServiceRef {
    const service = this.catalog.serviceBySlug(slug);
    return service ? toRef(service) : fallback ?? { id: null, slug, name: '' };
  }
}
