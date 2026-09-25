import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import {
  INCOMING_REQUESTS,
  INITIAL_PRO_SETTINGS,
  INITIAL_QUOTE_DRAFT,
  PRO_STATS,
} from '../data/pro.data';
import { IncomingRequest, IncomingStatus, ProPlan, ProSettings, QuoteDraft } from '../models/pro';
import { avatarOf } from '../models/avatar';
import { ToastService } from '../services/toast.service';
import { formatARS } from '../utils/format';
import { AuthStore } from './auth.store';
import { ClientRequestsStore } from './client-requests.store';

const DEMO_PRO_ID = 'juan';

export const INCOMING_TABS: { key: 'new' | 'quoted' | 'accepted'; label: string }[] = [
  { key: 'new', label: 'Nuevas' },
  { key: 'quoted', label: 'Presupuestadas' },
  { key: 'accepted', label: 'Aceptadas' },
];

/** Estado del área profesional (/pro). */
@Injectable({ providedIn: 'root' })
export class ProStore {
  private readonly toast = inject(ToastService);
  private readonly clientRequests = inject(ClientRequestsStore);
  private readonly auth = inject(AuthStore);

  /**
   * MOCK: identidad de ejemplo del área profesional (sigue sin integrar).
   * No es el usuario autenticado; el área lo aclara con un aviso de demostración.
   * `id` coincide con el profesional de ejemplo de las solicitudes mock.
   */
  readonly me = { id: DEMO_PRO_ID, ...avatarOf({ id: DEMO_PRO_ID, displayName: INITIAL_PRO_SETTINGS.name, avatarUrl: null }) };
  /** Perfil público REAL del usuario, solo si ya tiene ProfessionalProfile. */
  readonly publicProfileId = computed(() => this.auth.user()?.professionalProfileId ?? null);

  readonly available = signal(true);
  readonly plan = signal<ProPlan>('free');
  readonly isFree = computed(() => this.plan() === 'free');

  readonly requests = signal<IncomingRequest[]>(INCOMING_REQUESTS);
  readonly tab = signal<'new' | 'quoted' | 'accepted'>('new');

  readonly quote = signal<QuoteDraft>(INITIAL_QUOTE_DRAFT);
  readonly quoteSending = signal(false);
  readonly quoteSent = signal(false);
  readonly quoteTotal = computed(() => this.quote().labor + this.quote().materials);

  readonly settings = signal<ProSettings>(INITIAL_PRO_SETTINGS);

  readonly counts = computed(() => {
    const list = this.requests();
    return {
      new: list.filter((r) => r.status === 'new').length,
      quoted: list.filter((r) => r.status === 'quoted').length,
      accepted: list.filter((r) => this.inTab(r, 'accepted')).length,
    };
  });

  readonly newRequests = computed(() => this.requests().filter((r) => r.status === 'new'));
  readonly urgentNewCount = computed(() => this.newRequests().filter((r) => r.urgency !== 'Puede esperar').length);
  readonly quotedTotal = computed(() =>
    this.requests()
      .filter((r) => r.status === 'quoted')
      .reduce((sum, r) => sum + (r.quoteAmount ?? 0), 0),
  );
  readonly planUsagePct = (PRO_STATS.planUsed / PRO_STATS.planLimit) * 100;

  constructor() {
    effect(() => {
      const clientRequests = this.clientRequests.requests();
      untracked(() => this.requests.update((list) => list.map((request) => {
        if (!request.clientRequestId || !['quoted', 'accepted', 'scheduled'].includes(request.status)) return request;
        const client = clientRequests.find((item) => item.id === request.clientRequestId);
        if (!client || client.chosenId !== this.me.id) return request;
        const status: IncomingStatus = client.stage >= 4 ? 'completed' : client.stage === 3 ? 'scheduled' : 'accepted';
        return request.status === status ? request : { ...request, status };
      })));
    });
  }

  inTab(request: IncomingRequest, tab: 'new' | 'quoted' | 'accepted'): boolean {
    return tab === 'accepted'
      ? ['accepted', 'scheduled', 'completed'].includes(request.status)
      : request.status === tab;
  }

  byId(id: string | null | undefined): IncomingRequest | undefined {
    return this.requests().find((r) => r.id === id);
  }

  // ---- Disponibilidad y plan ----------------------------------------
  toggleAvailability(): void {
    const next = !this.available();
    this.available.set(next);
    this.toast.show(next ? 'Estás disponible hoy. Te mostramos en búsquedas.' : 'Pausaste tu disponibilidad por hoy.');
  }

  startProTrial(): void {
    this.plan.set('pro');
    this.toast.show('Activaste 30 días de PRO');
  }

  // ---- Solicitudes ---------------------------------------------------
  accept(id: string): void {
    const req = this.byId(id);
    if (!req || req.status !== 'new' || req.urgency !== 'Urgente') return;
    this.setStatus(id, 'accepted');
    this.tab.set('accepted');
    this.toast.show(`Aceptada. Le compartimos tu contacto a ${req.client}.`);
  }

  decline(id: string): void {
    const req = this.byId(id);
    if (!req || req.status !== 'new') return;
    this.setStatus(id, 'declined');
    this.toast.show(`Le avisamos a ${req.client} que hoy no podés.`);
  }

  // ---- Presupuesto ---------------------------------------------------
  updateQuote(patch: Partial<QuoteDraft>): void {
    this.quote.update((q) => ({ ...q, ...patch }));
  }

  resetQuoteStatus(): void {
    this.quoteSent.set(false);
    this.quoteSending.set(false);
    this.quote.set({ ...INITIAL_QUOTE_DRAFT });
  }

  sendQuote(requestId: string): void {
    const req = this.byId(requestId);
    if (!req || req.status !== 'new' || this.quoteSending() || this.quoteTotal() <= 0) return;
    this.quoteSending.set(true);
    const total = this.quoteTotal();
    this.requests.update((list) =>
      list.map((r) => (r.id === requestId ? { ...r, status: 'quoted', quoteAmount: total } : r)),
    );
    if (req.clientRequestId) this.clientRequests.receiveQuote(req.clientRequestId, {
      professionalId: this.me.id,
      amount: total,
      slot: this.quote().slot,
      description: this.quote().description,
    });
    this.tab.set('quoted');
    this.quoteSending.set(false);
    this.quoteSent.set(true);
    this.toast.show(`Presupuesto enviado a ${req.client} · ${formatARS(total)}`);
  }

  // ---- Perfil --------------------------------------------------------
  updateSettings(patch: Partial<ProSettings>): void {
    this.settings.update((s) => ({ ...s, ...patch }));
  }

  toggleSetting(key: 'serviceSlugs' | 'services' | 'zones', value: string): void {
    this.settings.update((s) => {
      const list = s[key] as string[];
      const next = list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
      return { ...s, [key]: next };
    });
  }

  saveSettings(): void {
    this.toast.show('Cambios guardados. Tu perfil ya está actualizado.');
  }

  private setStatus(id: string, status: IncomingStatus): void {
    this.requests.update((list) => list.map((r) => (r.id === id ? { ...r, status } : r)));
  }
}
