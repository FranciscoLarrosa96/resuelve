import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { ToastService } from '../../../core/services/toast.service';
import { Icon } from '../icon/icon';

/**
 * "Invitar a un profesional a sumarse": comparte (o copia) el enlace público
 * para crear un perfil. No manda nada a nadie por su cuenta ni guarda contactos.
 */
@Component({
  selector: 'app-invite-pro',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex' },
  template: `
    <button
      type="button"
      class="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-[15px] font-semibold text-brand hover:bg-brand-tint press"
      data-testid="invite-pro"
      (click)="share()"
    >
      <app-icon name="share" [size]="17" />Invitar a un profesional
    </button>
  `,
})
export class InvitePro {
  private readonly document = inject(DOCUMENT);
  private readonly toast = inject(ToastService);
  /** Para el texto: "…a sumarse en Azul". */
  readonly city = input<string | null>(null);

  protected async share(): Promise<void> {
    const url = `${this.document.location.origin}/soy-profesional`;
    const text = `Te recomiendo Resuelve para recibir pedidos de clientes${this.city() ? ` en ${this.city()}` : ''}. Crear el perfil es gratis.`;
    const nav = this.document.defaultView?.navigator;
    try {
      if (typeof nav?.share === 'function') {
        await nav.share({ title: 'Sumate a Resuelve', text, url });
        return;
      }
      await nav?.clipboard.writeText(`${text} ${url}`);
      this.toast.show('Enlace copiado. Mandáselo a quien quieras invitar.');
    } catch (error) {
      // Cerrar el menú de compartir no es un error.
      if ((error as DOMException)?.name !== 'AbortError')
        this.toast.show('No pudimos copiar el enlace', 2800, 'info');
    }
  }
}
