import { DestroyRef, Injectable, PLATFORM_ID, computed, effect, inject, signal, untracked } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { firstValueFrom, of } from 'rxjs';
import { NotificationsApiService } from '../api/notifications-api.service';
import {
  AppNotification,
  NotificationAudience,
  NotificationsSummary,
  notificationToast,
} from '../models/notification';
import { CurrentRoute } from '../services/current-route.service';
import { ToastService } from '../services/toast.service';
import { onTabVisible } from '../utils/on-tab-visible';
import { AuthStore } from './auth.store';

/** Polling liviano mientras la app está abierta (sin WebSocket). */
export const NOTIFICATIONS_POLL_MS = 60_000;

/** Detalle de la solicitud en cada modo: ahí las novedades se marcan leídas, no se anuncian. */
const DETAIL_PREFIX: Record<NotificationAudience, string> = {
  CLIENT: '/mis-solicitudes/',
  PROFESSIONAL: '/pro/solicitudes/',
};

function groupByRequest(items: readonly AppNotification[]): ReadonlyMap<string, AppNotification[]> {
  const map = new Map<string, AppNotification[]>();
  for (const n of items) map.set(n.requestId, [...(map.get(n.requestId) ?? []), n]);
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

  /** "Mis solicitudes": novedades + trabajos cuyo horario ya pasó y esperan confirmación. */
  readonly clientBadge = computed(() => {
    const c = this.summary()?.client;
    return c ? c.unread + c.completionDue : 0;
  });
  readonly proUnread = computed(() => this.summary()?.professional?.unread ?? 0);
  /** Agenda: trabajos con horario terminado que siguen sin cerrar. */
  readonly proCompletionDue = computed(() => this.summary()?.professional?.completionDue ?? 0);
  readonly clientByRequest = computed(() => groupByRequest(this.clientItems()));
  readonly proByRequest = computed(() => groupByRequest(this.proItems()));

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
  async markRead(requestId: string, audience: NotificationAudience): Promise<void> {
    const items = audience === 'CLIENT' ? this.clientItems : this.proItems;
    if (!items().some((n) => n.requestId === requestId)) return;
    items.update((list) => list.filter((n) => n.requestId !== requestId));
    try {
      this.summary.set(await firstValueFrom(this.api.readByRequest(requestId, audience)));
    } catch {
      void this.refresh();
    }
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
    this.lastArrival.set(null);
    this.seen.clear();
    this.seeded = false;
  }

  private async fetch(): Promise<void> {
    try {
      const summary = await firstValueFrom(this.api.summary());
      const [client, pro] = await Promise.all([
        firstValueFrom(summary.client.unread ? this.api.unread('CLIENT') : of([])),
        firstValueFrom(summary.professional?.unread ? this.api.unread('PROFESSIONAL') : of([])),
      ]);
      if (!this.auth.authenticated()) return;
      this.summary.set(summary);
      this.clientItems.set(client);
      this.proItems.set(pro);
      this.announce([...client.map((n) => ({ n, audience: 'CLIENT' as const })), ...pro.map((n) => ({ n, audience: 'PROFESSIONAL' as const }))]);
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
    const detail = DETAIL_PREFIX[newest.audience] + newest.n.requestId;
    if (this.route.url().split(/[?#]/)[0] === detail) return; // ya la está mirando
    this.toast.show(notificationToast(newest.n), 6000, 'info', {
      label: 'Ver',
      link: [detail],
    });
  }
}
