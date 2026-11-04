import { ChangeDetectionStrategy, Component, PLATFORM_ID, computed, inject, input, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ProExportsService } from '../../core/services/pro-exports.service';
import { ToastService } from '../../core/services/toast.service';
import { ProStore } from '../../core/state/pro.store';
import { Icon } from '../../shared/components/icon/icon';

/**
 * PDF del presupuesto (PRO). En el celular dice "Compartir PDF" y abre el menú
 * del sistema (WhatsApp, Mail, Archivos); en escritorio, "Descargar PDF".
 * Mismo botón en la solicitud y en el trabajo. Sin PRO vigente no se muestra.
 */
@Component({
  selector: 'app-quote-pdf-button',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  template: `
    @if (allowed()) {
      <button
        type="button"
        class="button-secondary inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold disabled:opacity-50 sm:w-auto"
        [disabled]="exports.busy()"
        (click)="run()"
        data-testid="quote-pdf"
      >
        <app-icon [name]="share ? 'share' : 'download'" [size]="16" [stroke]="2.2" />
        {{ label() }}
      </button>
    }
  `,
})
export class QuotePdfButton {
  readonly quoteId = input.required<string>();
  protected readonly exports = inject(ProExportsService);
  private readonly pro = inject(ProStore);
  private readonly toast = inject(ToastService);
  protected readonly allowed = computed(() => !!this.pro.plan()?.entitlements?.canExportQuotePdf);
  /** Se decide una vez: el SSR y el escritorio descargan. */
  protected readonly share = isPlatformBrowser(inject(PLATFORM_ID)) && this.exports.canShareFiles();
  private readonly working = signal(false);
  protected readonly label = computed(() => {
    if (this.exports.busy() && this.working()) return 'Preparando PDF…';
    if (this.exports.readyToShare() === this.quoteId()) return 'Compartir PDF ahora';
    return this.share ? 'Compartir PDF' : 'Descargar PDF';
  });

  protected async run(): Promise<void> {
    this.working.set(true);
    const result = await this.exports.quote(this.quoteId());
    this.working.set(false);
    if (result === 'needs-tap') this.toast.show('El PDF está listo. Tocá «Compartir PDF ahora».', 3500, 'info');
  }
}
