import { Injectable, computed, inject, signal } from '@angular/core';
import {
  INCOMING_REQUESTS,
  INITIAL_PRO_SETTINGS,
  INITIAL_QUOTE_DRAFT,
  PRO_STATS,
} from '../data/pro.data';
import { CURRENT_PRO_ID } from '../data/professionals.data';
import { CategoryName } from '../models/category';
import { IncomingRequest, IncomingStatus, ProPlan, ProSettings, QuoteDraft } from '../models/pro';
import { ProfessionalsService } from '../services/professionals.service';
import { ToastService } from '../services/toast.service';
import { formatARS } from '../utils/format';

export const INCOMING_TABS: { key: IncomingStatus; label: string }[] = [
  { key: 'new', label: 'Nuevas' },
  { key: 'quoted', label: 'Presupuestadas' },
  { key: 'accepted', label: 'Aceptadas' },
];

/** Estado del área profesional (/pro). */
@Injectable({ providedIn: 'root' })
export class ProStore {
  private readonly toast = inject(ToastService);
  private readonly pros = inject(ProfessionalsService);

  /** El profesional logueado (mock). */
  readonly me = this.pros.get(CURRENT_PRO_ID);

  readonly available = signal(true);
  readonly plan = signal<ProPlan>('free');
  readonly isFree = computed(() => this.plan() === 'free');

  readonly requests = signal<IncomingRequest[]>(INCOMING_REQUESTS);
  readonly tab = signal<IncomingStatus>('new');

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
      accepted: list.filter((r) => r.status === 'accepted').length,
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
    if (!req) return;
    this.setStatus(id, 'accepted');
    this.tab.set('accepted');
    this.toast.show(`Aceptada. Le compartimos tu contacto a ${req.client}.`);
  }

  decline(id: string): void {
    const req = this.byId(id);
    if (!req) return;
    this.requests.update((list) => list.filter((r) => r.id !== id));
    this.toast.show(`Le avisamos a ${req.client} que hoy no podés.`);
  }

  // ---- Presupuesto ---------------------------------------------------
  updateQuote(patch: Partial<QuoteDraft>): void {
    this.quote.update((q) => ({ ...q, ...patch }));
  }

  resetQuoteStatus(): void {
    this.quoteSent.set(false);
    this.quoteSending.set(false);
  }

  sendQuote(requestId: string): void {
    const req = this.byId(requestId);
    if (!req || this.quoteSending()) return;
    this.quoteSending.set(true);
    const total = this.quoteTotal();
    setTimeout(() => {
      this.requests.update((list) =>
        list.map((r) => (r.id === requestId ? { ...r, status: 'quoted', quoteAmount: total } : r)),
      );
      this.tab.set('quoted');
      this.quoteSending.set(false);
      this.quoteSent.set(true);
      this.toast.show(`Presupuesto enviado a ${req.client} · ${formatARS(total)}`);
    }, 1100);
  }

  // ---- Perfil --------------------------------------------------------
  updateSettings(patch: Partial<ProSettings>): void {
    this.settings.update((s) => ({ ...s, ...patch }));
  }

  toggleSetting(key: 'categories' | 'services' | 'zones', value: string): void {
    this.settings.update((s) => {
      const list = s[key] as string[];
      const next = list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
      return { ...s, [key]: key === 'categories' ? (next as CategoryName[]) : next };
    });
  }

  saveSettings(): void {
    this.toast.show('Cambios guardados. Tu perfil ya está actualizado.');
  }

  private setStatus(id: string, status: IncomingStatus): void {
    this.requests.update((list) => list.map((r) => (r.id === id ? { ...r, status } : r)));
  }
}
