import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  PLATFORM_ID,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { AppNotification, NotificationAudience, bellBadge, notificationCopy } from '../../../core/models/notification';
import { CurrentRoute } from '../../../core/services/current-route.service';
import { NotificationsStore } from '../../../core/state/notifications.store';
import { groupByDay, relativeTime } from '../../../core/utils/notification-time';
import { Icon } from '../icon/icon';

let sequence = 0;

/**
 * Campana del centro de notificaciones (cliente y profesional, cada una con las
 * suyas: los modos no se mezclan).
 *
 * - Badge con las no leídas ("9+" como tope); el número nunca es lo único: el
 *   botón anuncia "N sin leer" y cada aviso dice "Sin leer".
 * - Desktop: panel anclado a la campana (no tapa media app). Mobile (< 640 px):
 *   pantalla completa con su propio encabezado.
 * - Abrir un aviso lo deja leído y navega al lugar exacto; "Marcar todas como
 *   leídas" solo existe si hay sin leer. Nada se borra al leer.
 * - Escape cierra y devuelve el foco; clic afuera o navegar también cierran.
 */
@Component({
  selector: 'app-notification-bell',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'relative flex shrink-0',
    '(document:click)': 'onDocumentClick($event)',
    '(keydown.escape)': 'close(true)',
  },
  styles: `
    .bell {
      transition:
        background-color var(--duration-micro) var(--ease-out-soft),
        color var(--duration-micro) var(--ease-out-soft),
        transform var(--duration-micro) var(--ease-out-soft);
    }
    .bell:active {
      transform: scale(0.94);
    }
    .item {
      transition: background-color var(--duration-micro) var(--ease-out-soft);
    }
    .dot {
      transition:
        transform var(--duration-micro) var(--ease-out-soft),
        opacity var(--duration-micro) var(--ease-out-soft);
    }
    @media (prefers-reduced-motion: reduce) {
      .bell,
      .item,
      .dot {
        transition: none;
      }
      .bell:active {
        transform: none;
      }
    }
  `,
  template: `
    <button
      #trigger
      type="button"
      class="bell relative grid size-11 place-items-center rounded-full text-ink hover:bg-sand-dark focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand aria-expanded:bg-brand-tint aria-expanded:text-brand-dark"
      aria-haspopup="dialog"
      [attr.aria-expanded]="open()"
      [attr.aria-controls]="open() ? panelId : null"
      [attr.aria-label]="label()"
      data-testid="notification-bell"
      (click)="toggle()"
    >
      <app-icon name="bell" [size]="22" [stroke]="2" />
      @if (count() > 0) {
        @for (c of badgeKey(); track c) {
          <span
            class="absolute top-0.5 right-0.5 grid h-[18px] min-w-[18px] animate-pop place-items-center rounded-full bg-accent-fill px-1 text-[11px] leading-none font-bold text-white tabular-nums ring-2 ring-canvas"
            aria-hidden="true"
            data-testid="notification-badge"
            >{{ badge(c) }}</span
          >
        }
      }
    </button>

    @if (open()) {
      <div
        #panel
        [id]="panelId"
        (keydown.escape)="close(true)"
        role="dialog"
        aria-labelledby="{{ panelId }}-title"
        [attr.aria-modal]="mobile() ? 'true' : null"
        [style]="panelStyle()"
        class="fixed inset-0 z-[70] flex flex-col bg-surface-elevated max-sm:animate-up sm:inset-auto sm:max-h-[min(580px,calc(100dvh-96px))] sm:animate-menu-in sm:overflow-hidden sm:rounded-2xl sm:border sm:border-line sm:shadow-soft"
        animate.leave="animate-menu-out"
        data-testid="notification-panel"
      >
        <header
          class="flex items-center gap-2 border-b border-line px-4 pt-[max(12px,env(safe-area-inset-top))] pb-3 sm:pt-3"
        >
          <h2
            [id]="panelId + '-title'"
            #heading
            tabindex="-1"
            class="min-w-0 flex-1 text-[17px] font-semibold text-ink outline-none"
          >
            Notificaciones
          </h2>
          @if (count() > 0) {
            <button
              type="button"
              class="min-h-10 shrink-0 rounded-lg px-2.5 text-[14px] font-semibold text-brand hover:bg-brand-tint focus-visible:outline-2 focus-visible:outline-brand"
              (click)="markAll()"
            >
              Marcar todas como leídas
            </button>
          }
          <button
            type="button"
            class="grid size-10 shrink-0 place-items-center rounded-full text-ink-soft hover:bg-sand-dark focus-visible:outline-2 focus-visible:outline-brand sm:hidden"
            aria-label="Cerrar notificaciones"
            (click)="close(true)"
          >
            <app-icon name="close" [size]="20" />
          </button>
        </header>

        <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]" aria-live="polite">
          @if (state(); as c) {
            @if (c.error && !c.items.length) {
              <div class="px-4 py-8 text-center" role="alert">
                <p class="text-[15px] text-ink-soft">No pudimos cargar tus notificaciones.</p>
                <button
                  type="button"
                  class="mt-3 min-h-11 rounded-xl px-4 text-[15px] font-semibold text-brand underline"
                  (click)="reload()"
                >
                  Reintentar
                </button>
              </div>
            } @else if (c.loading && !c.items.length) {
              <div class="space-y-3 px-4 py-4" role="status">
                <span class="sr-only">Cargando notificaciones…</span>
                @for (i of [1, 2, 3]; track i) {
                  <div class="shimmer h-14 rounded-xl" aria-hidden="true"></div>
                }
              </div>
            } @else if (!c.items.length) {
              <div class="flex flex-col items-center px-6 py-12 text-center">
                <span class="grid size-12 place-items-center rounded-full bg-brand-tint text-brand" aria-hidden="true">
                  <app-icon name="check-circle" [size]="24" />
                </span>
                <p class="mt-4 text-[15px] font-semibold text-ink">No tenés notificaciones nuevas.</p>
                <p class="mt-1 max-w-[30ch] text-[14px] text-ink-soft">
                  Cuando haya novedades sobre tus solicitudes, las vas a ver acá.
                </p>
              </div>
            } @else {
              @for (g of groups(); track g.group) {
                <h3 class="px-4 pt-3 pb-1 text-[12px] font-semibold tracking-[0.06em] text-muted uppercase">
                  {{ g.group }}
                </h3>
                <ul class="m-0 list-none p-0">
                  @for (n of g.items; track n.id) {
                    <li>
                      <button
                        type="button"
                        class="item flex w-full min-h-16 items-start gap-3 px-4 py-3 text-left hover:bg-sand-light focus-visible:bg-sand-light focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
                        [class.bg-brand-tint]="!n.readAt"
                        (click)="openItem(n)"
                      >
                        <span
                          class="dot mt-[7px] size-2.5 shrink-0 rounded-full bg-accent-fill"
                          [class.opacity-0]="!!n.readAt"
                          [class.scale-0]="!!n.readAt"
                          aria-hidden="true"
                        ></span>
                        <span class="min-w-0 flex-1">
                          @if (!n.readAt) {
                            <span class="sr-only">Sin leer. </span>
                          }
                          <span class="block text-[15px] leading-snug text-ink" [class]="n.readAt ? 'font-medium' : 'font-semibold'">{{
                            copy(n).title
                          }}</span>
                          <span class="mt-0.5 block text-[14px] leading-snug text-ink-soft [overflow-wrap:anywhere]">{{
                            copy(n).detail
                          }}</span>
                          <span class="mt-1 block text-[13px] text-muted">{{ time(n) }}</span>
                        </span>
                      </button>
                    </li>
                  }
                </ul>
              }
              @if (store.centerHasMore()) {
                <div class="px-4 py-3 text-center">
                  <button
                    type="button"
                    class="min-h-11 rounded-xl px-4 text-[15px] font-semibold text-brand hover:bg-brand-tint disabled:opacity-60"
                    [disabled]="c.loading"
                    (click)="store.loadMore()"
                  >
                    {{ c.loading ? 'Cargando…' : 'Ver más' }}
                  </button>
                </div>
              }
            }
          }
        </div>
      </div>
    }
  `,
})
export class NotificationBell {
  protected readonly store = inject(NotificationsStore);
  private readonly router = inject(Router);
  private readonly route = inject(CurrentRoute);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly doc = inject(DOCUMENT);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  /** Modo de la pantalla: cada modo tiene sus avisos. */
  readonly audience = input.required<NotificationAudience>();
  /** Hacia dónde se abre el panel en desktop respecto de la campana. */
  readonly align = input<'right' | 'left'>('right');

  /** El panel se muestra en <body>: así ningún contenedor con `backdrop-filter`/`transform` lo recorta ni lo desplaza. */
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');

  protected readonly panelId = `notifications-panel-${++sequence}`;
  protected readonly open = signal(false);
  /** < 640 px: pantalla completa (diálogo modal). */
  protected readonly mobile = signal(false);
  protected readonly panelStyle = signal<Record<string, string>>({});

  protected readonly count = computed(() =>
    this.audience() === 'CLIENT' ? this.store.clientUnread() : this.store.proUnread(),
  );
  protected readonly label = computed(() => {
    const n = this.count();
    return n ? `Notificaciones, ${n} sin leer` : 'Notificaciones';
  });
  protected readonly state = computed(() => {
    const c = this.store.center();
    return c && c.audience === this.audience() ? c : null;
  });
  protected readonly groups = computed(() => groupByDay(this.state()?.items ?? []));
  protected readonly badge = bellBadge;
  /** Un solo elemento que se recrea al cambiar el número: así el badge hace su pequeño "pop". */
  protected readonly badgeKey = computed(() => [this.count()]);

  constructor() {
    effect(() => {
      const el = this.panel()?.nativeElement;
      if (el && el.parentElement !== this.doc.body) untracked(() => this.doc.body.appendChild(el));
    });
    // Navegar a otra pantalla (incluso desde un enlace de afuera) cierra el panel.
    let url = this.route.url();
    effect(() => {
      const next = this.route.url();
      if (next === url) return;
      url = next;
      untracked(() => this.close());
    });
    // Pantalla completa: la página de atrás no se desplaza.
    effect(() => {
      const lock = this.open() && this.mobile();
      untracked(() => {
        this.doc.documentElement.style.overflow = lock ? 'hidden' : '';
      });
    });
    inject(DestroyRef).onDestroy(() => {
      this.doc.documentElement.style.overflow = '';
      // El panel vive en <body>: si la campana se destruye con el panel abierto, se va con ella.
      this.panel()?.nativeElement.remove();
    });
    // Otra pantalla pidió abrir el centro: lo atiende la campana que se ve (la del sidebar o la del celular).
    let requested = this.store.centerRequest()?.n ?? 0;
    effect(() => {
      const req = this.store.centerRequest();
      if (!req || req.n === requested) return;
      requested = req.n;
      untracked(() => {
        if (req.audience === this.audience() && !this.open() && this.visible()) this.openPanel();
      });
    });
    // Llegó algo nuevo con el panel abierto: se relee la primera página.
    let arrivals = this.store.arrivals();
    effect(() => {
      const next = this.store.arrivals();
      if (next === arrivals) return;
      arrivals = next;
      if (untracked(() => this.open())) untracked(() => void this.store.openCenter(this.audience()));
    });
  }

  /** ¿La campana está a la vista? (un contenedor `hidden` no cuenta). */
  private visible(): boolean {
    return this.host.nativeElement.getClientRects().length > 0;
  }

  protected copy(n: AppNotification) {
    return notificationCopy(n);
  }

  protected time(n: AppNotification): string {
    return relativeTime(n.createdAt);
  }

  protected toggle(): void {
    if (this.open()) this.close(true);
    else this.openPanel();
  }

  protected reload(): void {
    void this.store.openCenter(this.audience());
  }

  private openPanel(): void {
    if (!this.browser) return;
    this.mobile.set(window.matchMedia?.('(max-width: 639.98px)').matches ?? false);
    this.panelStyle.set(this.mobile() ? {} : this.anchor());
    this.open.set(true);
    void this.store.openCenter(this.audience());
    afterNextRender(() => this.panel()?.nativeElement.querySelector<HTMLElement>('h2')?.focus(), {
      injector: this.injector,
    });
  }

  /** Posición fija junto a la campana (así el panel no queda recortado por un contenedor con scroll). */
  private anchor(): Record<string, string> {
    const rect = this.host.nativeElement.getBoundingClientRect();
    const width = Math.min(400, window.innerWidth - 24);
    const top = `${Math.round(rect.bottom + 8)}px`;
    const left =
      this.align() === 'right'
        ? Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12))
        : Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
    return { top, left: `${Math.round(left)}px`, width: `${width}px` };
  }

  protected close(restoreFocus = false): void {
    if (!this.open()) return;
    this.open.set(false);
    if (restoreFocus) this.host.nativeElement.querySelector<HTMLElement>('[data-testid="notification-bell"]')?.focus();
  }

  protected async openItem(n: AppNotification): Promise<void> {
    const route = await this.store.open(n, this.audience());
    this.close();
    await this.router.navigateByUrl(route);
  }

  protected markAll(): void {
    void this.store.markAll(this.audience());
  }

  protected onDocumentClick(event: MouseEvent): void {
    const target = event.target as Node;
    const inside = this.host.nativeElement.contains(target) || !!this.panel()?.nativeElement.contains(target);
    if (this.open() && !this.mobile() && !inside) this.close();
  }
}
