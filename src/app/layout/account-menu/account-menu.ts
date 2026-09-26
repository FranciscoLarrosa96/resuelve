import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CurrentRoute } from '../../core/services/current-route.service';
import { AuthStore } from '../../core/state/auth.store';
import { Icon } from '../../shared/components/icon/icon';
import { UserAvatar } from '../../shared/components/user-avatar/user-avatar';

/**
 * Identidad en el header desktop: mientras se restaura la sesión muestra
 * un lugar reservado (sin "Ingresar" que después desaparece); como
 * invitado, Ingresar / Crear cuenta; con sesión, avatar + nombre + menú.
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
        class="flex items-center gap-2 rounded-full py-0.5 pr-2.5 pl-0.5 text-sm font-semibold text-ink transition-colors hover:bg-sand-dark"
        aria-haspopup="menu" [attr.aria-expanded]="open()" aria-controls="account-menu"
        [attr.aria-label]="'Tu cuenta, ' + auth.displayName()" (click)="toggle()">
        <app-user-avatar [user]="user" class="size-[38px] rounded-full text-sm" />
        <span class="hidden max-w-[140px] truncate xl:inline">{{ user.firstName }}</span>
        <app-icon name="chevron-down" [size]="16" [stroke]="2.4" class="text-muted" />
      </button>
      @if (open()) {
        <div id="account-menu" role="menu" aria-label="Tu cuenta" (keydown)="onMenuKey($event)" animate.leave="animate-menu-out"
          class="absolute top-[calc(100%+8px)] right-0 z-30 w-60 origin-top-right animate-menu-in rounded-2xl border border-line bg-white p-1.5 shadow-soft">
          <div class="px-3 pt-2 pb-2.5">
            <div class="text-sm font-semibold break-words">{{ auth.displayName() }}</div>
            <div class="truncate text-[13px] text-muted" [attr.title]="user.email">{{ user.email }}</div>
          </div>
          <a role="menuitem" routerLink="/perfil" (click)="close()" class="block rounded-xl px-3 py-2.5 text-[14.5px] font-medium hover:bg-cream">Mi perfil</a>
          <a role="menuitem" routerLink="/mis-solicitudes" (click)="close()" class="block rounded-xl px-3 py-2.5 text-[14.5px] font-medium hover:bg-cream">Mis solicitudes</a>
          @if (user.professionalProfileId) {
            <a role="menuitem" routerLink="/pro/solicitudes" (click)="close()" class="block rounded-xl px-3 py-2.5 text-[14.5px] font-medium hover:bg-cream">Ir al panel profesional</a>
          }
          <button role="menuitem" type="button" (click)="logout()"
            class="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-[14.5px] font-medium hover:bg-cream">
            <app-icon name="logout" [size]="18" class="text-muted" />Cerrar sesión
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

  protected logout(): void {
    this.open.set(false);
    this.auth.logout();
  }
}
