import { DestroyRef, Injectable, PLATFORM_ID, computed, effect, inject, signal, untracked } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { firstValueFrom, of } from 'rxjs';
import { NotificationsApiService } from '../api/notifications-api.service';
import {
  AppNotification,
  NotificationAudience,
  NotificationSection,
  NotificationTab,
  NotificationsPage,
  NotificationsSummary,
  notificationToast,
} from '../models/notification';
import { CurrentRoute } from '../services/current-route.service';
import { ToastService } from '../services/toast.service';
import { onTabVisible } from '../utils/on-tab-visible';
import { AuthStore } from './auth.store';

const EMPTY_PAGE: NotificationsPage = { items: [], page: 1, pageSize: 50, total: 0 };

/** Polling liviano mientras la app está abierta (sin WebSocket). */
export const NOTIFICATIONS_POLL_MS = 60_000;

/** Estado del centro de notificaciones (el panel de la campana) de un modo. */
export interface NotificationCenter {
  audience: NotificationAudience;
  items: AppNotification[];
  /** Total del modo (para saber si hay más páginas). */
  total: number;
  page: number;
  loading: boolean;
  error: boolean;
}

/** Sin la ruta destino ni el hash: la pantalla donde ya está mirando la novedad no la anuncia. */
function pathOf(url: string): string {
  return url.split(/[?#]/)[0];
}

function groupByRequest(items: readonly AppNotification[]): ReadonlyMap<string, AppNotification[]> {
  const map = new Map<string, AppNotification[]>();
  for (const n of items) {
    if (n.requestId) map.set(n.requestId, [...(map.get(n.requestId) ?? []), n]);
  }
  return map;
}

/**
 * Novedades REALES del usuario autenticado, separadas por modo (cliente /
 * profesional: los contadores no se mezclan). Se consultan al iniciar
 * sesión, cada 60 s, al volver a la pestaña y después de acciones propias.
 * Una notificación nueva que aparece mientras la app está abierta se
 * anuncia UNA vez con un toast; al abrir la solicitud queda leída.
 */
@Injectable({ providedIn: 'root' })
export class NotificationsStore {
  private readonly api = inject(NotificationsApiService);
  private readonly auth = inject(AuthStore);
  private readonly toast = inject(ToastService);
  private readonly route = inject(CurrentRoute);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly summary = signal<NotificationsSummary | null>(null);
  readonly clientItems = signal<AppNotification[]>([]);
  readonly proItems = signal<AppNotification[]>([]);
  /** Cambia cuando llega algo nuevo: las pantallas abiertas se releen solas (sin F5). */
  readonly arrivals = signal(0);
  /** Última notificación nueva que llegó (para refrescar el detalle abierto). */
  readonly lastArrival = signal<AppNotification | null>(null);

  /**
   * "Mis solicitudes": novedades + trabajos cuyo horario ya pasó y esperan confirmación.
   * El recordatorio "¿Se realizó?" ya cuenta como trabajo por cerrar: no se suma dos veces.
   */
  readonly clientBadge = computed(() => {
    const c = this.summary()?.client;
    return c ? c.unread - (c.closureUnread ?? 0) + c.completionDue : 0;
  });
  /** Campana del modo cliente / profesional: todas las notificaciones sin leer de ese modo. */
  readonly clientUnread = computed(() => this.summary()?.client.unread ?? 0);
  readonly proUnread = computed(() => this.summary()?.professional?.unread ?? 0);
  /** Panel de la campana (null = nunca se abrió en esta sesión). */
  readonly center = signal<NotificationCenter | null>(null);
  /** Pedido de abrir el panel desde otra pantalla (p. ej. el inicio profesional): la campana visible lo atiende. */
  readonly centerRequest = signal<{ audience: NotificationAudience; n: number } | null>(null);
  requestCenter(audience: NotificationAudience): void {
    this.centerRequest.update((c) => ({ audience, n: (c?.n ?? 0) + 1 }));
  }
  readonly centerHasMore = computed(() => {
    const c = this.center();
    return !!c && c.items.length < c.total;
  });
  /** Agenda: trabajos con horario terminado que siguen sin cerrar. */
  readonly proCompletionDue = computed(() => this.summary()?.professional?.completionDue ?? 0);
  /** "Solicitudes" del menú: solo las novedades cuya acción está ahí (nunca las de la Agenda). */
  readonly proRequestsNews = computed(() => this.summary()?.professional?.requests?.total ?? 0);
  /** Novedades de la Agenda (horario confirmado). */
  readonly proAgendaNews = computed(() => this.summary()?.professional?.agenda ?? 0);
  /** Badge de "Agenda": horarios confirmados nuevos + trabajos pendientes de cierre. */
  readonly proAgendaBadge = computed(() => this.proAgendaNews() + this.proCompletionDue());
  /** Todo lo del modo profesional (para el cambio de modo desde el lado cliente). */
  readonly proTotal = computed(() => this.proRequestsNews() + this.proAgendaBadge());
  readonly clientByRequest = computed(() => groupByRequest(this.clientItems()));
  readonly proByRequest = computed(() => groupByRequest(this.proItems()));

  /** Novedades de una pestaña de /pro/solicitudes ("Nuevas, 1 novedad"). "Todas" no suma aparte. */
  proTabNews(tab: NotificationTab): number {
    return this.summary()?.professional?.requests?.[tab] ?? 0;
  }

  private readonly seen = new Set<string>();
  private seeded = false;
  private timer?: ReturnType<typeof setInterval>;
  private inFlight: Promise<void> | null = null;
  /** Lo activa el componente raíz (`connect()`): así ninguna pantalla aislada consulta por su cuenta. */
  private readonly connected = signal(false);

  constructor() {
    let userId: string | null | undefined;
    effect(() => {
      const id = this.connected() && this.auth.authenticated() ? (this.auth.user()?.id ?? null) : null;
      untracked(() => {
        if (id === userId) return;
        userId = id;
        this.stop();
        this.reset();
        if (id) this.start();
      });
    });
    onTabVisible(() => void this.refresh(), 15_000);
    inject(DestroyRef).onDestroy(() => this.stop());
  }

  /** Empieza a seguir las novedades mientras haya sesión (una vez, desde la raíz de la app). */
  connect(): void {
    this.connected.set(true);
  }

  /** Relee contadores y novedades. Llamadas simultáneas comparten el mismo pedido. */
  refresh(): Promise<void> {
    if (!this.isBrowser || !this.connected() || !this.auth.authenticated()) return Promise.resolve();
    this.inFlight ??= this.fetch().finally(() => (this.inFlight = null));
    return this.inFlight;
  }

  /**
   * Al abrir /mis-solicitudes/:id o /pro/solicitudes/:id: marca leídas SOLO
   * las de esa solicitud en ese modo. Sin novedades cargadas, no pide nada
   * (si llegan después, el detalle vuelve a llamar).
   */
  async markRead(requestId: string, audience: NotificationAudience, section?: NotificationSection): Promise<void> {
    const items = audience === 'CLIENT' ? this.clientItems : this.proItems;
    const matches = (n: AppNotification) => n.requestId === requestId && (!section || n.section === section);
    if (!items().some(matches)) return;
    items.update((list) => list.filter((n) => !matches(n)));
    try {
      this.summary.set(await firstValueFrom(this.api.readByRequest(requestId, audience, section)));
    } catch {
      void this.refresh();
    }
  }

  /** Abre el panel de la campana: relee la primera página del modo (con las leídas, para no vaciarlo). */
  async openCenter(audience: NotificationAudience): Promise<void> {
    const current = this.center();
    // Reabrir el mismo modo conserva lo que ya se vio mientras se relee (sin parpadeo).
    this.center.set(
      current?.audience === audience
        ? { ...current, loading: true, error: false }
        : { audience, items: [], total: 0, page: 0, loading: true, error: false },
    );
    await this.loadCenterPage(1);
  }

  /** "Ver más": siguiente página (20). */
  async loadMore(): Promise<void> {
    const c = this.center();
    if (!c || c.loading || !this.centerHasMore()) return;
    await this.loadCenterPage(c.page + 1);
  }

  /**
   * Abre una notificación: queda leída (optimista; el servidor es la verdad) y
   * devuelve el destino. La ruta guardada no autoriza nada: cada pantalla
   * vuelve a pedir lo suyo y responde 404 si no es de esa persona.
   */
  async open(n: AppNotification, audience: NotificationAudience): Promise<string> {
    const readAt = n.readAt ?? new Date().toISOString();
    this.center.update((c) => c && { ...c, items: c.items.map((i) => (i.id === n.id ? { ...i, readAt } : i)) });
    const unread = audience === 'CLIENT' ? this.clientItems : this.proItems;
    unread.update((list) => list.filter((i) => i.id !== n.id));
    if (!n.readAt) {
      this.bump(audience, -1);
      try {
        this.summary.set(await firstValueFrom(this.api.open(n.id)));
      } catch {
        void this.refresh();
      }
    }
    return n.route;
  }

  /** "Marcar todas como leídas" del modo. */
  async markAll(audience: NotificationAudience): Promise<void> {
    const now = new Date().toISOString();
    this.center.update((c) => c && { ...c, items: c.items.map((i) => ({ ...i, readAt: i.readAt ?? now })) });
    (audience === 'CLIENT' ? this.clientItems : this.proItems).set([]);
    try {
      this.summary.set(await firstValueFrom(this.api.readAll(audience)));
    } catch {
      void this.refresh();
    }
  }

  private async loadCenterPage(page: number): Promise<void> {
    const c = this.center();
    if (!c) return;
    this.center.set({ ...c, loading: true, error: false });
    try {
      const res = await firstValueFrom(this.api.list(c.audience, { page }));
      this.center.update(
        (cur) =>
          cur && {
            ...cur,
            items: page === 1 ? res.items : [...cur.items, ...res.items.filter((n) => !cur.items.some((i) => i.id === n.id))],
            total: res.total,
            page,
            loading: false,
          },
      );
    } catch {
      this.center.update((cur) => cur && { ...cur, loading: false, error: true });
    }
  }

  /** Ajuste optimista del contador de un modo mientras llega el resumen del servidor. */
  private bump(audience: NotificationAudience, by: number): void {
    this.summary.update((s) => {
      if (!s) return s;
      if (audience === 'CLIENT') return { ...s, client: { ...s.client, unread: Math.max(0, s.client.unread + by) } };
      return s.professional
        ? { ...s, professional: { ...s.professional, unread: Math.max(0, s.professional.unread + by) } }
        : s;
    });
  }

  private start(): void {
    if (!this.isBrowser) return;
    void this.refresh();
    this.timer = setInterval(() => void this.refresh(), NOTIFICATIONS_POLL_MS);
  }

  private stop(): void {
    clearInterval(this.timer);
    this.timer = undefined;
  }

  private reset(): void {
    this.summary.set(null);
    this.clientItems.set([]);
    this.proItems.set([]);
    this.center.set(null);
    this.lastArrival.set(null);
    this.seen.clear();
    this.seeded = false;
  }

  private async fetch(): Promise<void> {
    try {
      const summary = await firstValueFrom(this.api.summary());
      const [client, pro] = await Promise.all([
        firstValueFrom(summary.client.unread ? this.api.unread('CLIENT') : of(EMPTY_PAGE)),
        firstValueFrom(summary.professional?.unread ? this.api.unread('PROFESSIONAL') : of(EMPTY_PAGE)),
      ]);
      if (!this.auth.authenticated()) return;
      this.summary.set(summary);
      this.clientItems.set(client.items);
      this.proItems.set(pro.items);
      this.announce([
        ...client.items.map((n) => ({ n, audience: 'CLIENT' as const })),
        ...pro.items.map((n) => ({ n, audience: 'PROFESSIONAL' as const })),
      ]);
    } catch {
      // Sin conexión o servidor dormido: se reintenta en el próximo ciclo.
    }
  }

  /** Lo que aparece por primera vez: se anuncia una sola vez (la primera carga no anuncia nada). */
  private announce(list: { n: AppNotification; audience: NotificationAudience }[]): void {
    const fresh = list.filter(({ n }) => !this.seen.has(n.id));
    fresh.forEach(({ n }) => this.seen.add(n.id));
    if (!this.seeded) {
      this.seeded = true;
      return;
    }
    if (!fresh.length) return;
    const newest = fresh.sort((a, b) => b.n.createdAt.localeCompare(a.n.createdAt))[0];
    this.lastArrival.set(newest.n);
    this.arrivals.update((v) => v + 1);
    if (pathOf(this.route.url()) === pathOf(newest.n.route)) return; // ya la está mirando
    // Pasa a la lista del centro la próxima vez que se abra; mientras tanto, un aviso visible (también en el celular).
    this.center.update((c) => (c && c.audience === newest.audience ? { ...c, total: c.total + 1 } : c));
    const [path, fragment] = newest.n.route.split('#');
    this.toast.show(notificationToast(newest.n), 8000, 'info', {
      label: 'Ver',
      link: [path],
      ...(fragment ? { fragment } : {}),
    });
  }
}
