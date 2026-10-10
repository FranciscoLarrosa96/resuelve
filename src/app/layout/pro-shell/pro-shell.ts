import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { CurrentRoute } from '../../core/services/current-route.service';
import { AuthStore } from '../../core/state/auth.store';
import { NotificationsStore } from '../../core/state/notifications.store';
import { ProRequestsStore } from '../../core/state/pro-requests.store';
import { newsLabel } from '../../core/utils/badges';
import { JobsStore } from '../../core/state/jobs.store';
import { MobileNav, MobileNavItem } from '../mobile-nav/mobile-nav';
import { ProSidebar } from '../pro-sidebar/pro-sidebar';
import { Logo } from '../../shared/components/logo/logo';
import { ModeSwitch } from '../../shared/components/mode-switch/mode-switch';
import { AccountMenu } from '../account-menu/account-menu';
import { NotificationBell } from '../../shared/components/notification-bell/notification-bell';
import { ProStore } from '../../core/state/pro.store';
import { Dialog } from '../../shared/components/dialog/dialog';
import { SiteFooter } from '../../shared/components/site-footer/site-footer';
import { FunnelTracker } from '../../core/analytics/funnel-tracker';
import { Celebrate } from '../../shared/components/celebrate/celebrate';

/**
 * Marco del área profesional.
 * Desktop: sidebar + contenido. Mobile/tablet: navegación inferior.
 * Sin sesión confirmada (restaurando, SSR/prerender o camino a /ingresar)
 * solo muestra "Cargando tu cuenta…": el panel no se monta sin usuario.
 */
const UNTIL = new Intl.DateTimeFormat('es-AR', {
  day: 'numeric',
  month: 'long',
  timeZone: 'America/Argentina/Buenos_Aires',
});

@Component({
  selector: 'app-pro-shell',
  imports: [
    RouterOutlet,
    RouterLink,
    ProSidebar,
    MobileNav,
    Logo,
    ModeSwitch,
    AccountMenu,
    NotificationBell,
    Dialog,
    SiteFooter,
    Celebrate,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
  template: `
    @if (!auth.authenticated()) {
      <!-- Restaurando la sesión (y el HTML prerenderizado): nunca contenido del panel ni datos de ejemplo. -->
      <main class="flex min-h-dvh flex-col items-center justify-center px-4 pb-16">
        <h1 class="sr-only">Panel profesional</h1>
        <app-logo />
        <div class="mt-8 flex flex-col items-center gap-3" role="status">
          <span
            class="size-7 animate-spin rounded-full border-[3px] border-brand/25 border-t-brand"
            aria-hidden="true"
          ></span>
          <p class="text-sm text-muted">Cargando tu cuenta…</p>
        </div>
      </main>
    } @else {
      <div class="min-h-dvh lg:grid lg:grid-cols-[232px_minmax(0,1fr)]">
        <app-pro-sidebar class="hidden bg-sidebar lg:block" />
        <main
          class="workspace-content flex min-h-dvh min-w-0 flex-col lg:px-7 lg:pt-7 lg:pb-16 xl:px-9 2xl:px-12"
          [class]="showMobileNav() ? 'max-lg:pb-21' : ''"
        >
          @if (showMobileNav()) {
            <!-- Mobile/tablet: marca + modo actual + menú de cuenta (en desktop están en el sidebar). En teléfonos angostos el cambio de modo vive en el menú ("Ver como cliente"). -->
            <header
              class="flex items-center justify-between gap-3 border-b border-line-soft px-4 py-2.5 lg:hidden md:px-6"
            >
              <a
                routerLink="/pro/dashboard"
                class="rounded-lg"
                aria-label="Resuelve, panel profesional"
                ><app-logo
              /></a>
              <div class="flex items-center gap-2">
                <app-mode-switch mode="pro" class="max-[479px]:hidden" />
                <app-notification-bell audience="PROFESSIONAL" />
                <app-account-menu mode="pro" variant="compact" />
              </div>
            </header>
            <!-- Teléfonos angostos: el cambio de modo a todo el ancho, a la vista. -->
            <div class="border-b border-line-soft px-4 py-2 min-[480px]:hidden lg:hidden">
              <app-mode-switch mode="pro" [block]="true" />
            </div>
          }
          <router-outlet />
          <app-site-footer [compact]="true" [mobileNav]="false" class="mt-auto max-lg:px-4 max-lg:pb-6" />
        </main>
      </div>
      @if (showMobileNav()) {
        <app-mobile-nav [items]="navItems()" label="Área profesional" />
      }
      <app-dialog
        [open]="showFirstSuccess()"
        labelledBy="first-success-title"
        describedBy="first-success-copy"
        [dismissable]="!celebrationBusy()"
        (dismiss)="continueFree()"
      >
        <div class="flex justify-center pt-1"><app-celebrate /></div>
        <p class="mt-4 text-center text-sm font-semibold tracking-[0.12em] text-brand uppercase">
          Tu primer cliente
        </p>
        <h2
          id="first-success-title"
          class="mt-2 text-center font-display text-[28px] leading-tight font-bold tracking-[-0.02em]"
        >
          🎉 ¡Aceptaron tu primer presupuesto!
        </h2>
        <p id="first-success-copy" class="mt-3 text-center text-[15px] leading-relaxed text-ink-soft">
          ¡Felicitaciones! Un cliente acaba de elegir tu propuesta en Resuelve. Este es el comienzo de nuevas oportunidades para hacer crecer tu actividad.
          <span class="mt-2 block">
            Seguí aprovechando nuevas oportunidades, destacá tu perfil y llegá a más clientes con
            Resuelve PRO.
          </span>
        </p>
        <div class="mt-6 flex flex-col gap-2 sm:flex-row-reverse">
          <button
            type="button"
            class="button-primary h-12 rounded-xl sm:flex-1 px-4 text-[15px] font-semibold disabled:opacity-60"
            [disabled]="celebrationBusy()"
            (click)="continuePro()"
          >
            Conocer Resuelve PRO
          </button>
          <button
            type="button"
            class="h-12 rounded-xl sm:flex-1 px-4 text-[15px] font-semibold text-ink-soft hover:bg-sand"
            [disabled]="celebrationBusy()"
            (click)="continueFree()"
          >
            Seguir con mi plan gratuito
          </button>
        </div>
      </app-dialog>
      <app-dialog
        [open]="!!referral()"
        labelledBy="referral-celebration-title"
        describedBy="referral-celebration-copy"
        (dismiss)="closeReferral()"
      >
        @if (referral(); as r) {
          <div class="flex justify-center pt-1"><app-celebrate /></div>
          <p class="mt-4 text-center text-sm font-semibold tracking-[0.12em] text-brand uppercase">
            {{ r.role === 'REFERRER' ? 'Tu enlace funcionó' : 'Bienvenido a Resuelve' }}
          </p>
          <h2
            id="referral-celebration-title"
            class="mt-2 text-center font-display text-[28px] leading-tight font-bold tracking-[-0.02em] break-words"
            data-testid="referral-celebration-title"
          >
            @if (r.role === 'REFERRER') {
              🎉 ¡{{ r.friendName }} se sumó con tu enlace!
            } @else {
              🎉 ¡{{ r.friendName }} te regaló {{ r.days }} días de PRO!
            }
          </h2>
          <div id="referral-celebration-copy" class="mt-3 text-center text-[15px] leading-relaxed text-ink-soft">
            @if (r.role === 'REFERRER') {
              <p>
                Los dos tienen <strong class="text-ink">{{ r.days }} días de Resuelve PRO</strong>. El
                tuyo dura hasta el {{ until(r.accessUntil) }}.
              </p>
              <p class="mt-2" data-testid="referral-celebration-left">
                @if (r.rewardsLeft === 0) {
                  Ya sumaste el máximo de días por invitar. Tus próximos colegas igual reciben los suyos.
                } @else {
                  Invitá a {{ r.rewardsLeft === 1 ? '1 colega más' : r.rewardsLeft + ' colegas más' }} y
                  sumá {{ r.days }} días por cada uno.
                }
              </p>
            } @else {
              <p>
                Ya tenés <strong class="text-ink">Resuelve PRO hasta el {{ until(r.accessUntil) }}</strong>:
                respondé oportunidades sin límite. A {{ r.friendName }} también le sumamos
                {{ r.days }} días.
              </p>
            }
          </div>
          <div class="mt-6 flex flex-col gap-2 sm:flex-row-reverse">
            @if (r.role === 'REFERRER' && r.rewardsLeft) {
              <button
                type="button"
                class="button-primary h-12 rounded-xl sm:flex-1 px-4 text-[15px] font-semibold"
                (click)="inviteMore()"
              >
                Invitar a otro colega
              </button>
              <button
                type="button"
                class="h-12 rounded-xl sm:flex-1 px-4 text-[15px] font-semibold text-ink-soft hover:bg-sand"
                (click)="closeReferral()"
              >
                Listo
              </button>
            } @else {
              <button
                type="button"
                class="button-primary h-12 rounded-xl sm:flex-1 px-4 text-[15px] font-semibold"
                (click)="closeReferral()"
              >
                {{ r.role === 'REFERRED' ? 'Empezar' : 'Listo' }}
              </button>
            }
          </div>
        }
      </app-dialog>
    }
  `,
})
export class ProShell {
  protected readonly auth = inject(AuthStore);
  private readonly route = inject(CurrentRoute);
  private readonly reqs = inject(ProRequestsStore);
  private readonly notifications = inject(NotificationsStore);
  private readonly jobs = inject(JobsStore);
  private readonly pro = inject(ProStore);
  private readonly router = inject(Router);
  private readonly funnel = inject(FunnelTracker);
  /** Solo las novedades cuya acción está en Solicitudes (nueva, te eligieron, necesitan otro horario). */
  private readonly requestsBadge = this.notifications.proRequestsNews;

  protected readonly navItems = computed<MobileNavItem[]>(() => [
    { label: 'Inicio', link: '/pro/dashboard', icon: 'home', activeOn: ['/pro/dashboard'] },
    {
      label: 'Solicitudes',
      link: '/pro/solicitudes',
      icon: 'list',
      activeOn: ['/pro/solicitudes'],
      badge: this.requestsBadge(),
      badgeLabel: newsLabel(this.requestsBadge(), 'Solicitudes'),
    },
    {
      label: 'Agenda',
      link: '/pro/agenda',
      icon: 'calendar',
      activeOn: ['/pro/agenda'],
      badge: this.jobs.toCoordinateCount(),
      badgeLabel:
        this.jobs.toCoordinateCount() === 1
          ? 'Agenda, 1 trabajo para coordinar'
          : 'Agenda, ' + this.jobs.toCoordinateCount() + ' trabajos para coordinar',
    },
    { label: 'Perfil', link: '/pro/perfil', icon: 'user', activeOn: ['/pro/perfil'] },
  ]);

  protected readonly showMobileNav = computed(() => this.route.data()['mobileNav'] === true);
  protected readonly showFirstSuccess = computed(
    () => !!this.pro.ownProfile()?.showFirstSuccessCelebration,
  );
  protected readonly celebrationBusy = signal(false);
  /** Festejo de referidos: uno por vez y nunca encima del de primer cliente. */
  protected readonly referral = computed(() =>
    this.showFirstSuccess() ? null : (this.pro.ownProfile()?.referralCelebration ?? null),
  );

  constructor() {
    effect(() => {
      if (this.reqs.hasProfile()) untracked(() => this.reqs.loadPendingCount());
    });
    effect(() => {
      if (this.auth.user()?.professionalProfileId) untracked(() => this.jobs.load());
    });
    // Medición: el popup se vio (una vez por sesión; el backend deduplica por día).
    effect(() => {
      if (this.showFirstSuccess()) untracked(() => this.funnel.track('PRO_PLAN_VIEWED', 'FIRST_SUCCESS'));
    });
  }

  protected until(iso: string): string {
    return UNTIL.format(new Date(iso));
  }

  protected closeReferral(): void {
    void this.pro.acknowledgeReferralCelebration();
  }

  protected inviteMore(): void {
    void this.pro.acknowledgeReferralCelebration();
    void this.router.navigate(['/pro/plan'], { fragment: 'invitar' });
  }

  protected async continueFree(): Promise<void> {
    if (this.celebrationBusy()) return;
    this.celebrationBusy.set(true);
    await this.pro.acknowledgeFirstSuccess();
    this.celebrationBusy.set(false);
  }

  protected async continuePro(): Promise<void> {
    if (this.celebrationBusy()) return;
    this.celebrationBusy.set(true);
    this.funnel.track('PRO_CTA_CLICKED', 'FIRST_SUCCESS');
    await this.pro.acknowledgeFirstSuccess();
    this.celebrationBusy.set(false);
    // "Conocer": lleva a Plan sin abrir el pedido (`quiero`) ni activar nada.
    await this.router.navigate(['/pro/plan']);
  }
}
