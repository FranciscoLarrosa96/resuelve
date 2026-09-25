import { Injectable, computed, inject, signal } from '@angular/core';
import {
  CATEGORIES,
  DEFAULT_REQUEST_TEXT,
  INITIAL_DRAFT,
  SPOKEN_EXAMPLE,
  URGENCY_LABELS,
} from '../data/catalog.data';
import { CategoryName } from '../models/category';
import { ClientRequest, RequestStep, ServiceRequestDraft } from '../models/service-request';
import { ProfessionalsService } from '../services/professionals.service';
import { interpretRequest } from '../utils/interpret-request';
import { joinNames } from '../utils/format';
import { ClientRequestsStore } from './client-requests.store';

export const FLOW_STEPS = 6;
const MAX_HOME_PHOTOS = 4;
const MAX_FLOW_PHOTOS = 6;
const MAX_RECIPIENTS = 3;

let draftSequence = 0;
/** Id local del borrador (el id definitivo lo asigna el backend al enviarlo). */
function newDraftId(): string {
  return `draft-${Date.now().toString(36)}-${++draftSequence}`;
}

/** Título por defecto de un servicio elegido directamente ("Problema eléctrico"). */
function defaultTitle(category: CategoryName): string {
  return CATEGORIES.find((c) => c.name === category)?.defaultProblem ?? category;
}

/**
 * El pedido del cliente. Se crea en el Home y viaja por:
 * solicitud → resultados → perfil → presupuesto → confirmación.
 */
@Injectable({ providedIn: 'root' })
export class RequestStore {
  private readonly pros = inject(ProfessionalsService);
  private readonly clientRequests = inject(ClientRequestsStore);

  // ---- Home: texto libre + fotos + "Hablar" ------------------------
  readonly homeText = signal('');
  readonly homePhotos = signal(0);
  readonly listening = signal(false);
  private speakTimer?: ReturnType<typeof setInterval>;

  // ---- Pedido --------------------------------------------------------
  readonly draft = signal<ServiceRequestDraft>(INITIAL_DRAFT);
  readonly urgencyLabel = computed(() => URGENCY_LABELS[this.draft().urgency]);

  // ---- Flujo "Crear solicitud" -------------------------------------
  readonly step = signal<RequestStep>(0);
  readonly analyzing = signal(false);
  readonly changingCategory = signal(false);
  readonly showDates = signal(false);
  readonly progress = computed(() => ((this.step() + 1) / FLOW_STEPS) * 100);
  private analyzeTimer?: ReturnType<typeof setTimeout>;
  private advanceTimer?: ReturnType<typeof setTimeout>;

  // ---- Solicitud de presupuesto ------------------------------------
  readonly recipientIds = signal<string[]>([]);
  readonly comment = signal('');
  readonly sending = signal(false);
  /** Destinatarios del último envío (pantalla de confirmación). */
  readonly lastSentIds = signal<string[]>([]);
  private requestVersion = 0;

  readonly recipients = computed(() => this.pros.many(this.recipientIds()));
  readonly recipientNames = computed(() => joinNames(this.recipients().map((p) => p.firstName)));

  // ---- Home ----------------------------------------------------------
  setHomeText(text: string): void {
    this.homeText.set(text);
  }

  addHomePhoto(): void {
    this.homePhotos.update((n) => Math.min(MAX_HOME_PHOTOS, n + 1));
  }

  removeHomePhoto(): void {
    this.homePhotos.update((n) => Math.max(0, n - 1));
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
    const photos = this.homePhotos();
    const { category, problem } = interpretRequest(text);
    this.resetForNewRequest();
    this.draft.set({
      ...INITIAL_DRAFT,
      id: newDraftId(),
      description: text,
      category,
      title: problem,
      photos,
    });
    this.step.set(0);
    this.changingCategory.set(false);
    this.showDates.set(false);
    this.analyzing.set(true);
    clearTimeout(this.analyzeTimer);
    this.analyzeTimer = setTimeout(() => this.analyzing.set(false), 1400);
  }

  /** Elegir un rubro directamente (Servicios más pedidos / filtros / "Cambiar servicio"). */
  setCategory(category: CategoryName): void {
    this.draft.update((d) => ({ ...d, category, title: defaultTitle(category) }));
    this.changingCategory.set(false);
  }

  /** Resumen corto editable. Vacío no se acepta: se conserva el anterior. */
  updateTitle(title: string): void {
    const clean = title.trim().slice(0, 140);
    if (clean) this.draft.update((d) => ({ ...d, title: clean }));
  }

  /**
   * Descripción editable. Si el texto nuevo corresponde claramente a otro
   * servicio, se actualizan servicio y título y se vuelve al paso de
   * detección para que el cliente lo confirme: nunca queda "pérdida en la
   * pileta" con Electricidad. Devuelve true si cambió el servicio.
   */
  updateDescription(text: string): boolean {
    const description = text.trim().slice(0, 2000);
    this.draft.update((d) => ({ ...d, description }));
    if (!description) return false;
    const detected = interpretRequest(description);
    if (!detected.matched || detected.category === this.draft().category) return false;
    this.draft.update((d) => ({ ...d, category: detected.category, title: detected.problem }));
    this.changingCategory.set(false);
    this.goToStep(0);
    return true;
  }

  /**
   * "Crear solicitud similar": arma un borrador NUEVO a partir de una solicitud
   * anterior. Copia título, descripción, servicio y zona; todo lo demás
   * (estado, presupuestos, invitaciones, profesional, turno, reseña, fecha,
   * urgencia y fotos) arranca de cero. Lleva a "Revisá tu pedido".
   * La solicitud original no se modifica.
   */
  repeatFrom(request: ClientRequest): void {
    this.resetForNewRequest();
    this.draft.set({
      ...this.draft(),
      id: newDraftId(),
      sourceRequestId: request.id,
      title: request.title,
      description: request.description ?? '',
      category: request.category,
      zone: request.zone,
    });
    this.step.set(5);
  }

  // ---- Flujo ---------------------------------------------------------
  updateDraft(patch: Partial<ServiceRequestDraft>, advance = false): void {
    this.draft.update((d) => {
      const next = { ...d, ...patch };
      if (patch.urgency === 'urgent') next.when = 'Ahora';
      else if (patch.urgency === 'today') next.when = 'Hoy';
      else if (patch.urgency === 'wait' && d.urgency === 'urgent') next.when = 'Hoy';
      else if (patch.when !== undefined && !this.isToday(patch.when)) next.urgency = 'wait';
      else if (patch.when !== undefined && d.urgency === 'urgent') next.urgency = 'today';
      return next;
    });
    if (advance) {
      clearTimeout(this.advanceTimer);
      this.advanceTimer = setTimeout(() => this.next(), 280);
    }
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

  addFlowPhoto(): void {
    const photos = this.draft().photos;
    if (photos < MAX_FLOW_PHOTOS) this.updateDraft({ photos: photos + 1 });
  }

  removeFlowPhoto(): void {
    this.updateDraft({ photos: Math.max(0, this.draft().photos - 1) });
  }

  // ---- Presupuesto ---------------------------------------------------
  askProfessionals(ids: string[]): void {
    this.recipientIds.set([...new Set(ids)].filter((id) => this.pros.many([id]).length > 0).slice(0, MAX_RECIPIENTS));
  }

  addRecipient(id: string): void {
    this.recipientIds.update((ids) => (ids.includes(id) ? ids : [...ids, id].slice(0, MAX_RECIPIENTS)));
  }

  removeRecipient(id: string): void {
    this.recipientIds.update((ids) => (ids.length > 1 ? ids.filter((x) => x !== id) : ids));
  }

  /** Candidatos para sumar al pedido (misma categoría, no incluidos). */
  readonly addableRecipients = computed(() => {
    const ids = this.recipientIds();
    return this.pros
      .inCategory(this.draft().category)
      .filter((p) => !ids.includes(p.id))
      .slice(0, 4);
  });

  readonly canAddRecipient = computed(() => this.recipientIds().length < MAX_RECIPIENTS);

  /** Envía la solicitud. Resuelve cuando "llega" (latencia simulada). */
  send(): Promise<boolean> {
    if (this.sending() || !this.recipientIds().length) return Promise.resolve(false);
    this.sending.set(true);
    const version = this.requestVersion;
    return new Promise((resolve) => {
      queueMicrotask(() => {
        if (version !== this.requestVersion) { resolve(false); return; }
        const d = this.draft();
        const ids = this.recipientIds();
        this.clientRequests.add({
          title: d.title,
          description: d.description,
          category: d.category,
          zone: d.zone,
          date: 'Recién',
          stage: 0,
          professionalIds: [...ids],
        });
        this.lastSentIds.set([...ids]);
        this.comment.set('');
        this.sending.set(false);
        resolve(true);
      });
    });
  }

  resetForNewRequest(): void {
    this.requestVersion++;
    clearTimeout(this.analyzeTimer);
    clearTimeout(this.advanceTimer);
    clearInterval(this.speakTimer);
    this.listening.set(false);
    this.homeText.set('');
    this.homePhotos.set(0);
    // Borrador nuevo: sin la descripción de ejemplo (si no, quedaría "pileta" con otro servicio).
    this.draft.set({
      ...INITIAL_DRAFT,
      id: newDraftId(),
      description: '',
      title: defaultTitle(INITIAL_DRAFT.category),
      zone: this.draft().zone,
      photos: 0,
      urgency: 'wait',
      when: 'Hoy',
    });
    this.step.set(0);
    this.analyzing.set(false);
    this.changingCategory.set(false);
    this.showDates.set(false);
    this.recipientIds.set([]);
    this.lastSentIds.set([]);
    this.comment.set('');
    this.sending.set(false);
  }

  private isToday(when: string): boolean {
    return when === 'Hoy' || when === 'Ahora' || when.startsWith('Hoy ');
  }
}
