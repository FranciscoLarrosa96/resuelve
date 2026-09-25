import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  PLATFORM_ID,
  effect,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

/**
 * Diálogo modal accesible sobre `<dialog>` nativo:
 * - `showModal()` vuelve inerte el resto de la página (foco atrapado);
 * - Escape y clic en el fondo cierran, salvo con `dismissable` en false
 *   (p. ej. mientras se confirma algo en el servidor);
 * - `aria-labelledby` apunta al título que pasa quien lo usa;
 * - al cerrar, el foco vuelve al elemento que lo abrió.
 * Desktop: centrado y con ancho contenido. Mobile (< 640px): bottom sheet.
 */
@Component({
  selector: 'app-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    dialog {
      margin: auto;
      width: min(440px, calc(100% - 32px));
      max-height: calc(100dvh - 32px);
      padding: 0;
      border: 1px solid var(--color-line);
      border-radius: 20px;
      background: #fff;
      color: var(--color-ink);
      overflow: auto;
    }
    dialog[open] {
      animation: dialog-in 0.22s var(--ease-out-soft) both;
    }
    dialog::backdrop {
      background: rgba(28, 33, 30, 0.32);
      animation: backdrop-in 0.2s ease-out both;
    }
    @media (max-width: 639.98px) {
      dialog {
        width: 100%;
        max-width: 100%;
        margin: auto 0 0;
        border-radius: 22px 22px 0 0;
        border-bottom: 0;
        padding-bottom: env(safe-area-inset-bottom);
      }
      dialog[open] {
        animation: sheet-in 0.3s var(--ease-sheet) both;
      }
    }
    @keyframes dialog-in {
      from { opacity: 0; transform: translateY(6px) scale(0.98); }
      to { opacity: 1; transform: none; }
    }
    @keyframes sheet-in {
      from { transform: translateY(100%); }
      to { transform: none; }
    }
    @keyframes backdrop-in {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @media (prefers-reduced-motion: reduce) {
      dialog[open], dialog::backdrop { animation: none; }
    }
  `,
  template: `
    <dialog
      #dialog
      [attr.aria-labelledby]="labelledBy()"
      [attr.aria-describedby]="describedBy()"
      (cancel)="onCancel($event)"
      (click)="onBackdrop($event)"
    >
      @if (open()) {
        <div class="p-5 sm:p-6">
          <ng-content />
        </div>
      }
    </dialog>
  `,
})
export class Dialog {
  readonly open = input.required<boolean>();
  readonly labelledBy = input.required<string>();
  readonly describedBy = input<string | null>(null);
  /** false = Escape y el fondo no cierran (acción en curso). */
  readonly dismissable = input(true);
  /** El usuario pidió cerrar (Escape o fondo). Quien lo usa decide el estado. */
  readonly dismiss = output<void>();

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private opener: HTMLElement | null = null;

  constructor() {
    effect(() => {
      const el = this.dialog().nativeElement;
      if (!this.browser) return;
      if (this.open() && !el.open) {
        this.opener = document.activeElement as HTMLElement | null;
        if (typeof el.showModal === 'function') el.showModal();
        else el.setAttribute('open', ''); // entornos sin <dialog> modal (tests)
      } else if (!this.open() && el.open) {
        if (typeof el.close === 'function') el.close();
        else el.removeAttribute('open');
        const opener = this.opener;
        this.opener = null;
        // Si el botón que lo abrió ya no existe (p. ej. la card cambió de estado), no se fuerza el foco.
        if (opener?.isConnected) opener.focus();
      }
    });
  }

  protected onCancel(event: Event): void {
    event.preventDefault();
    if (this.dismissable()) this.dismiss.emit();
  }

  /** Clic fuera del contenido: el target es el propio <dialog> (el fondo). */
  protected onBackdrop(event: MouseEvent): void {
    if (event.target === this.dialog().nativeElement && this.dismissable()) this.dismiss.emit();
  }
}
