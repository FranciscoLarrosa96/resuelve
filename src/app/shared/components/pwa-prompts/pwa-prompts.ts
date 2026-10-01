import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { NetworkStatus } from '../../../core/pwa/network-status';
import { PwaInstall } from '../../../core/pwa/pwa-install.service';
import { PwaUpdate } from '../../../core/pwa/pwa-update.service';
import { CurrentRoute } from '../../../core/services/current-route.service';
import { Dialog } from '../dialog/dialog';
import { Icon } from '../icon/icon';

/** Si hay un modal abierto o la persona está escribiendo, la sugerencia espera. */
const BUSY_RETRY_MS = 15_000;

/**
 * Avisos de la app instalable, abajo (sobre la barra mobile) y de a uno:
 * 1. "Sin conexión" (sin datos inventados: Reintentar relee las pantallas);
 * 2. "Hay una nueva versión" (recarga solo al tocar Actualizar);
 * 3. la sugerencia discreta de instalar (ver `PwaInstall.suggest`).
 * Más las instrucciones de iOS / Safari de macOS, que no tienen prompt nativo.
 */
@Component({
  selector: 'app-pwa-prompts',
  imports: [Dialog, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="pointer-events-none fixed inset-x-3 bottom-[calc(84px+env(safe-area-inset-bottom))] z-40 flex flex-col items-stretch gap-2 lg:inset-x-auto lg:right-6 lg:bottom-6 lg:w-[384px]"
    >
      <div aria-live="polite" role="status" class="contents">
        @if (!network.online()) {
          <div
            class="pointer-events-auto flex animate-toast-in items-start gap-3 rounded-2xl bg-inverse px-4 py-3.5 text-on-inverse shadow-toast [--toast-from:8px]"
            data-testid="offline-banner"
          >
            <app-icon name="wifi-off" [size]="20" [stroke]="2" class="mt-0.5" />
            <div class="min-w-0 flex-1">
              <p class="text-[14.5px] font-semibold">Sin conexión</p>
              <p class="mt-0.5 text-[14px] leading-[1.45] opacity-85">
                @if (stillOffline()) {
                  Seguís sin conexión.
                }
                Necesitás internet para actualizar solicitudes, presupuestos y agenda.
              </p>
            </div>
            <button
              type="button"
              class="-my-1 -mr-1.5 flex min-h-10 shrink-0 items-center rounded-lg px-2.5 text-[14px] font-semibold underline underline-offset-3 hover:bg-on-inverse/10"
              (click)="retry()"
            >
              Reintentar
            </button>
          </div>
        } @else if (update.available()) {
          <div
            class="pointer-events-auto flex animate-toast-in items-center gap-3 rounded-2xl bg-inverse px-4 py-3 text-on-inverse shadow-toast [--toast-from:8px]"
            data-testid="update-banner"
          >
            <app-icon name="refresh" [size]="19" [stroke]="2" />
            <p class="min-w-0 flex-1 text-[14px] leading-snug font-medium">
              Hay una nueva versión de Resuelve.
            </p>
            <button
              type="button"
              class="-my-1 shrink-0 rounded-lg px-2 py-2 text-[14px] font-medium opacity-85 hover:bg-on-inverse/10"
              (click)="update.dismiss()"
            >
              Después
            </button>
            <button
              type="button"
              class="-my-1 -mr-1.5 flex min-h-10 shrink-0 items-center rounded-lg px-2.5 text-[14px] font-semibold underline underline-offset-3 hover:bg-on-inverse/10 disabled:opacity-60"
              [disabled]="update.applying()"
              (click)="update.apply()"
            >
              {{ update.applying() ? 'Actualizando…' : 'Actualizar' }}
            </button>
          </div>
        }
      </div>

      @if (showInstall()) {
        <section
          class="pointer-events-auto animate-toast-in rounded-2xl border border-line bg-surface p-4 shadow-float [--toast-from:8px]"
          aria-labelledby="pwa-install-title"
          data-testid="install-banner"
        >
          <div class="flex items-start gap-3">
            <img
              src="logo-96.png"
              width="44"
              height="44"
              alt=""
              class="size-11 shrink-0 rounded-[11px]"
            />
            <div class="min-w-0 flex-1">
              <h2 id="pwa-install-title" class="text-[15px] font-semibold text-ink">
                {{ copy().title }}
              </h2>
              <p class="mt-0.5 text-[14px] leading-[1.45] text-muted">{{ copy().text }}</p>
            </div>
          </div>
          <div class="mt-3 flex justify-end gap-2">
            <button
              type="button"
              class="h-10 rounded-xl px-3.5 text-[14px] font-semibold text-ink-soft hover:bg-sand-light"
              (click)="later()"
            >
              Ahora no
            </button>
            <button
              type="button"
              class="button-primary flex h-10 items-center gap-2 rounded-xl px-4 text-[14px] font-semibold"
              (click)="install.install()"
            >
              <app-icon name="download" [size]="16" [stroke]="2.2" />Instalar
            </button>
          </div>
        </section>
      }
    </div>

    <app-dialog
      [open]="install.instructionsOpen()"
      labelledBy="pwa-ios-title"
      describedBy="pwa-ios-steps"
      (dismiss)="install.closeInstructions()"
    >
      <div class="flex items-center gap-3">
        <img
          src="logo-96.png"
          width="44"
          height="44"
          alt=""
          class="size-11 shrink-0 rounded-[11px]"
        />
        <h2 id="pwa-ios-title" class="font-display text-[22px] font-bold tracking-[-0.02em]">
          Instalá Resuelve
        </h2>
      </div>
      @if (install.platform() === 'mac-safari') {
        <ol
          id="pwa-ios-steps"
          class="mt-4 flex flex-col gap-3 text-[15px] leading-[1.45] text-ink-soft"
        >
          <li class="flex items-center gap-3">
            <span
              class="grid size-8 shrink-0 place-items-center rounded-lg bg-sand text-ink"
              aria-hidden="true"
              >1</span
            ><span
              >En la barra de menú, abrí
              <strong class="font-semibold text-ink">Archivo</strong>.</span
            >
          </li>
          <li class="flex items-center gap-3">
            <span
              class="grid size-8 shrink-0 place-items-center rounded-lg bg-sand text-ink"
              aria-hidden="true"
              >2</span
            ><span>Elegí <strong class="font-semibold text-ink">“Agregar al Dock”</strong>.</span>
          </li>
          <li class="flex items-center gap-3">
            <span
              class="grid size-8 shrink-0 place-items-center rounded-lg bg-sand text-ink"
              aria-hidden="true"
              >3</span
            ><span>Confirmá <strong class="font-semibold text-ink">“Agregar”</strong>.</span>
          </li>
        </ol>
      } @else {
        <ol
          id="pwa-ios-steps"
          class="mt-4 flex flex-col gap-3 text-[15px] leading-[1.45] text-ink-soft"
        >
          <li class="flex items-center gap-3">
            <span
              class="grid size-8 shrink-0 place-items-center rounded-lg bg-sand text-brand"
              aria-hidden="true"
              ><app-icon name="share" [size]="18" [stroke]="2"
            /></span>
            <span
              >1. Tocá <strong class="font-semibold text-ink">Compartir</strong> en la barra del
              navegador.</span
            >
          </li>
          <li class="flex items-center gap-3">
            <span
              class="grid size-8 shrink-0 place-items-center rounded-lg bg-sand text-brand"
              aria-hidden="true"
              ><app-icon name="plus-square" [size]="18" [stroke]="2"
            /></span>
            <span
              >2. Elegí
              <strong class="font-semibold text-ink">“Agregar a pantalla de inicio”</strong>.</span
            >
          </li>
          <li class="flex items-center gap-3">
            <span
              class="grid size-8 shrink-0 place-items-center rounded-lg bg-sand text-brand"
              aria-hidden="true"
              ><app-icon name="check" [size]="18" [stroke]="2.4"
            /></span>
            <span>3. Confirmá <strong class="font-semibold text-ink">“Agregar”</strong>.</span>
          </li>
        </ol>
      }
      <button
        type="button"
        class="button-primary mt-5 h-12 w-full rounded-xl text-[15px] font-semibold"
        (click)="install.closeInstructions()"
      >
        Entendido
      </button>
    </app-dialog>
  `,
})
export class PwaPrompts {
  protected readonly network = inject(NetworkStatus);
  protected readonly update = inject(PwaUpdate);
  protected readonly install = inject(PwaInstall);
  private readonly route = inject(CurrentRoute);
  private readonly document = inject(DOCUMENT);

  protected readonly stillOffline = signal(false);
  /** La sugerencia pasó el chequeo de "no molestar" (modal abierto, escribiendo, formulario tocado). */
  private readonly clear = signal(false);
  protected readonly showInstall = computed(
    () =>
      this.install.suggest() && this.clear() && this.network.online() && !this.update.available(),
  );
  protected readonly copy = computed(() =>
    this.route.matches('/pro')
      ? {
          title: 'Llevá tu trabajo con vos',
          text: 'Instalá Resuelve para entrar rápido a solicitudes y agenda.',
        }
      : {
          title: 'Instalá Resuelve',
          text: 'Tené tus solicitudes, agenda y profesionales a un toque.',
        },
  );

  constructor() {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = () => {
      if (this.busy()) timer = setTimeout(check, BUSY_RETRY_MS);
      else this.clear.set(true);
    };
    effect(() => {
      const suggest = this.install.suggest();
      untracked(() => {
        clearTimeout(timer);
        if (!suggest) this.clear.set(false);
        else if (!this.clear()) check();
      });
    });
    inject(DestroyRef).onDestroy(() => clearTimeout(timer));
    effect(() => {
      if (this.network.online()) untracked(() => this.stillOffline.set(false));
    });
  }

  protected retry(): void {
    this.stillOffline.set(!this.network.retry());
  }

  protected later(): void {
    this.install.dismiss();
  }

  private busy(): boolean {
    const doc = this.document;
    const active = doc.activeElement as HTMLElement | null;
    const typing =
      !!active && (/^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName) || active.isContentEditable);
    return typing || !!doc.querySelector('dialog[open], form.ng-dirty');
  }
}
