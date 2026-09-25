import { Injectable, computed, inject, signal } from '@angular/core';
import {
  CATEGORIES,
  DEFAULT_REQUEST_TEXT,
  INITIAL_DRAFT,
  SPOKEN_EXAMPLE,
  URGENCY_LABELS,
} from '../data/catalog.data';
import { CategoryName } from '../models/category';
import { RequestStep, ServiceRequestDraft } from '../models/service-request';
import { ProfessionalsService } from '../services/professionals.service';
import { interpretRequest } from '../utils/interpret-request';
import { joinNames } from '../utils/format';
import { ClientRequestsStore } from './client-requests.store';

export const FLOW_STEPS = 6;
const MAX_HOME_PHOTOS = 4;
const MAX_FLOW_PHOTOS = 6;
const MAX_RECIPIENTS = 3;

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
  readonly recipientIds = signal<string[]>(['martin']);
  readonly comment = signal('');
  readonly sending = signal(false);
  /** Destinatarios del último envío (pantalla de confirmación). */
  readonly lastSentIds = signal<string[]>(['martin']);

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
    const { category, problem } = interpretRequest(text);
    this.draft.update((d) => ({
      ...d,
      text,
      category,
      problem,
      photos: this.homePhotos() || d.photos,
    }));
    this.step.set(0);
    this.changingCategory.set(false);
    this.showDates.set(false);
    this.analyzing.set(true);
    clearTimeout(this.analyzeTimer);
    this.analyzeTimer = setTimeout(() => this.analyzing.set(false), 1400);
  }

  /** Elegir un rubro directamente (Servicios más pedidos / filtros). */
  setCategory(category: CategoryName): void {
    const meta = CATEGORIES.find((c) => c.name === category);
    this.draft.update((d) => ({ ...d, category, problem: meta?.defaultProblem ?? d.problem }));
    this.changingCategory.set(false);
  }

  // ---- Flujo ---------------------------------------------------------
  updateDraft(patch: Partial<ServiceRequestDraft>, advance = false): void {
    this.draft.update((d) => ({ ...d, ...patch }));
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
    this.recipientIds.set(ids.slice(0, MAX_RECIPIENTS));
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
    if (this.sending()) return Promise.resolve(false);
    this.sending.set(true);
    return new Promise((resolve) => {
      setTimeout(() => {
        const d = this.draft();
        const ids = this.recipientIds();
        this.clientRequests.add({
          title: d.problem,
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
      }, 1300);
    });
  }
}
