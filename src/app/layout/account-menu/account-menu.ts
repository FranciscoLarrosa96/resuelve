import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CurrentRoute } from '../../core/services/current-route.service';
import { AuthStore } from '../../core/state/auth.store';
import { AppMode } from '../../shared/components/mode-switch/mode-switch';
import { Icon } from '../../shared/components/icon/icon';
import { UserAvatar } from '../../shared/components/user-avatar/user-avatar';

/**
 * Menú de cuenta ÚNICO (cliente y profesional): al tocar avatar + nombre se
 * abre con "Mi perfil", el cambio de modo ("Modo profesional" / "Ver como
 * cliente") y, separado, "Cerrar sesión". Mientras se restaura la sesión
 * muestra un lugar reservado; como invitado, Ingresar / Crear cuenta.
 *
 * Variantes del disparador:
 *  - 'header': avatar + nombre (header desktop del cliente).
 *  - 'sidebar': avatar + nombre + email, abre hacia arriba (sidebar profesional).
 *  - 'compact': solo avatar (header mobile profesional).
 * Teclado: flechas/Inicio/Fin recorren, Escape cierra y devuelve el foco.
 */
@Component({
  selector: 'app-account-menu',
  imports: [RouterLink, Icon, UserAvatar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'relative flex shrink-0 items-center gap-2',
    '(document:click)': 'onDocumentClick($event)',
    '(keydown.escape)': 'close(true)',
  },
  template: `
    @if (auth.initializing()) {
      <span class="shimmer size-[38px] rounded-full" aria-hidden="true"></span>
      <span class="sr-only" role="status">Cargando tu sesión…</span>
    } @else if (auth.user(); as user) {
      <button type="button"
        [class]="triggerClass()"
        aria-haspopup="menu" [attr.aria-expanded]="open()" [attr.aria-controls]="menuId()"
        [attr.aria-label]="'Tu cuenta, ' + auth.displayName()" (click)="toggle()">
        <app-user-avatar [user]="user" [class]="variant() === 'sidebar' ? 'size-9 shrink-0 rounded-full text-xs' : 'size-[38px] shrink-0 rounded-full text-sm'" />
        @switch (variant()) {
          @case ('header') {
            <span class="hidden max-w-[140px] truncate xl:inline">{{ user.firstName }}</span>
          }
          @case ('sidebar') {
            <span class="min-w-0 flex-1 text-left">
              <span class="block truncate text-[13.5px] font-semibold" [attr.title]="auth.displayName()">{{ auth.displayName() }}</span>
              <span class="block truncate text-xs font-normal text-muted" [attr.title]="user.email">{{ user.email }}</span>
            </span>
          }
        }
        @if (variant() !== 'compact') {
          <app-icon [name]="variant() === 'sidebar' ? 'chevron-up' : 'chevron-down'" [size]="16" [stroke]="2.4" class="shrink-0 text-muted" />
        }
      </button>
      @if (open()) {
        <div [id]="menuId()" role="menu" aria-label="Tu cuenta" (keydown)="onMenuKey($event)" animate.leave="animate-menu-out"
          [class]="panelClass()">
          @if (variant() !== 'sidebar') {
            <div class="px-3 pt-2 pb-2.5">
              <div class="text-sm font-semibold break-words">{{ auth.displayName() }}</div>
              <div class="truncate text-[13px] text-muted" [attr.title]="user.email">{{ user.email }}</div>
            </div>
          }
          @if (mode() === 'pro') {
            <a role="menuitem" routerLink="/pro/perfil" (click)="close()" class="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[14.5px] font-medium hover:bg-cream">
              <app-icon name="user" [size]="17" class="text-muted" />Mi perfil
            </a>
            <a role="menuitem" routerLink="/" (click)="close()" class="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[14.5px] font-medium hover:bg-cream">
              <app-icon name="home" [size]="17" class="text-muted" />Ver como cliente
            </a>
          } @else {
            <a role="menuitem" routerLink="/perfil" (click)="close()" class="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[14.5px] font-medium hover:bg-cream">
              <app-icon name="user" [size]="17" class="text-muted" />Mi perfil
            </a>
            <a role="menuitem" routerLink="/mis-solicitudes" (click)="close()" class="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[14.5px] font-medium hover:bg-cream">
              <app-icon name="list" [size]="17" class="text-muted" />Mis solicitudes
            </a>
            @if (user.professionalProfileId) {
              <a role="menuitem" routerLink="/pro/dashboard" (click)="close()" class="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[14.5px] font-medium hover:bg-cream">
                <app-icon name="briefcase" [size]="17" class="text-muted" />Modo profesional
              </a>
            }
          }
          @if (user.isAdmin) {
            <a role="menuitem" routerLink="/admin/matriculas" (click)="close()" class="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[14.5px] font-medium hover:bg-cream">
              <app-icon name="shield" [size]="17" class="text-muted" />Panel de matrículas
            </a>
          }
          <div role="separator" class="mx-2 my-1.5 border-t border-line"></div>
          <button role="menuitem" type="button" (click)="logout()"
            class="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[14.5px] font-semibold text-danger hover:bg-danger-soft">
            <app-icon name="logout" [size]="18" />Cerrar sesión
          </button>
        </div>
      }
    } @else {
      <a routerLink="/ingresar" [queryParams]="returnParams()"
        class="rounded-xl px-3 py-[9px] text-sm font-semibold whitespace-nowrap text-ink transition-colors hover:bg-sand-dark">Ingresar</a>
      <a routerLink="/registro" [queryParams]="returnParams()"
        class="rounded-xl bg-brand px-3.5 py-[9px] text-sm font-semibold whitespace-nowrap text-white hover:bg-brand-dark press">Crear cuenta</a>
    }
  `,
})
export class AccountMenu {
  protected readonly auth = inject(AuthStore);
  private readonly route = inject(CurrentRoute);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  protected readonly open = signal(false);

  /** Modo de la pantalla: define "Mi perfil" y el cambio de modo. */
  readonly mode = input<AppMode>('client');
  readonly variant = input<'header' | 'sidebar' | 'compact'>('header');

  protected readonly menuId = computed(() => `account-menu-${this.variant()}`);
  protected readonly triggerClass = computed(() => {
    switch (this.variant()) {
      case 'sidebar':
        return 'flex w-full min-w-0 items-center gap-2.5 rounded-xl px-1.5 py-1.5 text-ink transition-colors hover:bg-white';
      case 'compact':
        return 'flex items-center rounded-full p-0.5 text-ink transition-colors hover:bg-sand-dark';
      default:
        return 'flex items-center gap-2 rounded-full py-0.5 pr-2.5 pl-0.5 text-sm font-semibold text-ink transition-colors hover:bg-sand-dark';
    }
  });
  protected readonly panelClass = computed(() => {
    const base = 'absolute z-30 w-60 animate-menu-in rounded-2xl border border-line bg-white p-1.5 shadow-soft';
    return this.variant() === 'sidebar'
      ? `${base} bottom-[calc(100%+8px)] left-0 origin-bottom-left`
      : `${base} top-[calc(100%+8px)] right-0 origin-top-right`;
  });

  /** Volver a la pantalla actual después de ingresar (salvo el inicio). */
  protected readonly returnParams = computed(() => {
    const url = this.route.url();
    return url && url !== '/' ? { returnUrl: url } : {};
  });

  protected toggle(): void {
    this.open.update((o) => !o);
    if (this.open()) {
      afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>('[role="menuitem"]')?.focus(), {
        injector: this.injector,
      });
    }
  }

  protected close(restoreFocus = false): void {
    if (!this.open()) return;
    this.open.set(false);
    if (restoreFocus) this.host.nativeElement.querySelector<HTMLElement>('[aria-haspopup="menu"]')?.focus();
  }

  /** Flechas, Inicio y Fin recorren las opciones (patrón de menú ARIA). */
  protected onMenuKey(event: KeyboardEvent): void {
    const items = [...this.host.nativeElement.querySelectorAll<HTMLElement>('[role="menuitem"]')];
    if (!items.length) return;
    const current = items.indexOf(document.activeElement as HTMLElement);
    let next: number;
    switch (event.key) {
      case 'ArrowDown': next = (current + 1) % items.length; break;
      case 'ArrowUp': next = (current - 1 + items.length) % items.length; break;
      case 'Home': next = 0; break;
      case 'End': next = items.length - 1; break;
      case 'Tab': this.close(); return;
      default: return;
    }
    event.preventDefault();
    items[next].focus();
  }

  protected onDocumentClick(event: MouseEvent): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) this.close();
  }

  /** Logout real (POST /auth/logout + limpieza local, una sola vez): lo hace AuthStore. */
  protected logout(): void {
    this.open.set(false);
    this.auth.logout();
  }
}
