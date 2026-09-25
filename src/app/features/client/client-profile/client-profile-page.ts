import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ToastService } from '../../../core/services/toast.service';
import { AuthStore } from '../../../core/state/auth.store';
import { ClientRequestsStore } from '../../../core/state/client-requests.store';
import { Icon } from '../../../shared/components/icon/icon';
import { SessionPending } from '../../../shared/components/session-pending/session-pending';
import { UserAvatar } from '../../../shared/components/user-avatar/user-avatar';

/**
 * Identidad real (GET /auth/me). La edición de datos todavía no tiene
 * endpoint en el backend: se muestran, no se editan.
 * Solicitudes y modo profesional siguen con datos mock.
 */
@Component({
  selector: 'app-client-profile-page',
  imports: [RouterLink, Icon, UserAvatar, SessionPending],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-2xl animate-fade-in px-4 pt-5.5 pb-6 lg:max-w-3xl lg:px-8 lg:pt-12 lg:pb-18">
      @if (auth.user(); as user) {
      <div class="flex items-center gap-3.5 px-1">
        <app-user-avatar [user]="user" class="size-15 rounded-2xl text-xl lg:size-20 lg:rounded-3xl lg:text-2xl" />
        <div class="min-w-0">
          <h1 class="truncate font-display text-[22px] font-bold lg:text-[34px] lg:font-extrabold lg:tracking-[-0.035em]">{{ auth.displayName() }}</h1>
          <div class="truncate text-sm text-muted lg:text-base">{{ user.email }}</div>
        </div>
      </div>

      <div class="mt-5.5 grid gap-3.5 lg:mt-8 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-start lg:gap-5">
        <div class="flex min-w-0 flex-col gap-3.5">
        <section class="rounded-2xl border border-line bg-white px-4 pt-3.5 pb-1" aria-labelledby="my-data-title">
          <h2 id="my-data-title" class="text-xs font-semibold tracking-[0.06em] text-muted uppercase">Mis datos</h2>
          <dl class="mt-1 divide-y divide-line-soft">
            <div class="flex items-baseline justify-between gap-4 py-3">
              <dt class="text-sm text-muted">Nombre</dt><dd class="min-w-0 truncate text-right text-[15px] font-medium">{{ user.firstName }}</dd>
            </div>
            <div class="flex items-baseline justify-between gap-4 py-3">
              <dt class="text-sm text-muted">Apellido</dt><dd class="min-w-0 truncate text-right text-[15px] font-medium">{{ user.lastName }}</dd>
            </div>
            <div class="flex items-baseline justify-between gap-4 py-3">
              <dt class="text-sm text-muted">Email</dt><dd class="min-w-0 truncate text-right text-[15px] font-medium">{{ user.email }}</dd>
            </div>
            <div class="flex items-baseline justify-between gap-4 py-3">
              <dt class="text-sm text-muted">Teléfono</dt>
              <dd class="min-w-0 text-right text-[15px] font-medium">
                @if (user.phone) {
                  {{ user.phone }}
                  <span class="ml-1 text-[13px] font-normal text-muted">· {{ user.phoneVerified ? 'Verificado' : 'Sin verificar' }}</span>
                } @else {
                  <span class="font-normal text-muted">Sin cargar</span>
                }
              </dd>
            </div>
          </dl>
          <p class="border-t border-line-soft py-3 text-[13px] text-muted">Pronto vas a poder editar estos datos desde acá.</p>
        </section>
        <ul class="overflow-hidden rounded-2xl border border-line bg-white">
          @for (item of items; track item.label) {
            <li class="border-b border-line-soft last:border-b-0">
              @if (item.link) {
                <a [routerLink]="item.link" class="flex items-center gap-3 px-4 py-3.75 text-[15px] font-medium hover:bg-cream">
                  <span class="flex-1">{{ item.label }}</span>
                  @if (item.link === '/mis-solicitudes' && pending()) {
                    <span class="rounded-full bg-accent px-2 py-0.5 text-[11px] font-bold text-white">{{ pending() }}</span>
                  }
                  <app-icon name="chevron-right" [stroke]="2.4" class="text-subtle" />
                </a>
              } @else {
                <button type="button" class="flex w-full items-center gap-3 px-4 py-3.75 text-left text-[15px] font-medium hover:bg-cream" (click)="soon(item.label)">
                  <span class="flex-1">{{ item.label }}</span>
                  <app-icon name="chevron-right" [stroke]="2.4" class="text-subtle" />
                </button>
              }
            </li>
          }
          <li>
            <button type="button" class="flex w-full items-center gap-3 px-4 py-3.75 text-left text-[15px] font-medium hover:bg-cream" (click)="auth.logout()">
              <app-icon name="logout" [size]="20" class="text-muted" />
              <span class="flex-1">Cerrar sesión</span>
            </button>
          </li>
        </ul>
        </div>

        <div class="rounded-2xl bg-brand p-4.5 text-white">
          <h2 class="text-base font-semibold">¿Ofrecés un servicio?</h2>
          <p class="mt-1 text-sm leading-[1.45] text-on-brand">Pasá al modo profesional con la misma cuenta.</p>
          <a routerLink="/pro" class="mt-3.5 inline-flex h-11.5 items-center rounded-xl bg-white px-4.5 text-[14.5px] font-semibold text-brand">
            Ir al modo profesional
          </a>
        </div>
      </div>
      } @else {
        <app-session-pending />
      }
    </div>
  `,
})
export class ClientProfilePage {
  private readonly toast = inject(ToastService);
  protected readonly auth = inject(AuthStore);
  protected readonly pending = inject(ClientRequestsStore).pendingActions;

  protected readonly items: { label: string; link?: string }[] = [
    { label: 'Mis solicitudes', link: '/mis-solicitudes' },
    { label: 'Direcciones guardadas' },
    { label: 'Profesionales guardados' },
    { label: 'Notificaciones' },
  ];

  constructor() {
    // Datos al día desde GET /auth/me (si falla, queda lo cargado al iniciar sesión).
    // En el prerender no hay sesión: no se pide nada.
    if (this.auth.authenticated()) this.auth.loadMe().catch(() => undefined);
  }

  protected soon(label: string): void {
    this.toast.show(`“${label}” estará disponible próximamente`);
  }
}
