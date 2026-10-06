import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { PublicLinks } from '../../../core/acquisition/public-links';
import { qrPngDataUrl } from '../../../core/utils/qr-png';
import { Dialog } from '../dialog/dialog';
import { Icon } from '../icon/icon';

/**
 * "Pedí reseñas": el profesional tiene UN enlace y UN QR fijos (no se generan por cliente).
 * Después de un trabajo hecho por fuera de Resuelve, se lo manda por WhatsApp o le muestra el QR:
 * el cliente puntúa en un toque (ver `InvitedReviewPage`). Esas reseñas quedan rotuladas aparte.
 */
@Component({
  selector: 'app-review-invite',
  imports: [Dialog, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
  template: `
    <section
      id="pedir-resenas"
      class="scroll-mt-6 rounded-xl border border-line bg-surface p-5"
      aria-labelledby="review-invite-title"
    >
      <h2 id="review-invite-title" class="font-sans text-xl font-bold md:text-2xl">
        Pedile una reseña a tus clientes
      </h2>
      <p class="mt-2 max-w-xl text-[15px] leading-6 text-muted">
        Terminás un trabajo, les mandás tu enlace o les mostrás el QR, y puntúan en un toque. Sirve
        también para los trabajos que hiciste por fuera de Resuelve.
      </p>
      <div class="mt-4 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap">
        <a
          [href]="whatsapp()"
          target="_blank"
          rel="noopener noreferrer"
          class="button-primary flex min-h-12 items-center justify-center rounded-xl px-5 text-[16px] font-semibold"
          data-testid="review-invite-whatsapp"
          >Mandar por WhatsApp</a
        >
        <button
          type="button"
          class="button-secondary min-h-12 rounded-xl px-5 text-[16px] font-semibold"
          data-testid="review-invite-qr"
          (click)="showQr()"
        >
          Mostrar QR
        </button>
        <button
          type="button"
          class="min-h-12 rounded-xl px-4 text-[16px] font-semibold text-brand"
          (click)="copy()"
        >
          Copiar enlace
        </button>
      </div>
      <p role="status" class="mt-2 flex min-h-5 items-center gap-1.5 text-[14px] text-muted">
        @if (notice()) {
          <app-icon name="check" [size]="14" [stroke]="3" class="animate-pop text-brand" aria-hidden="true" />
        }{{ notice() }}
      </p>
      <p class="mt-1 text-[14px] leading-[1.45] text-muted">
        Se muestran en tu perfil aparte, como «Cliente invitado por el profesional». No cambian tu
        puntaje ni tu lugar en las búsquedas: eso lo definen los trabajos hechos por Resuelve.
      </p>
    </section>

    <app-dialog [open]="open()" labelledBy="review-qr-title" (dismiss)="open.set(false)">
      <div class="flex items-center justify-between gap-4">
        <h2 id="review-qr-title" class="font-display text-2xl font-bold">Mostrale este QR al cliente</h2>
        <button
          type="button"
          class="grid size-11 shrink-0 place-items-center rounded-xl button-secondary"
          aria-label="Cerrar"
          (click)="open.set(false)"
        >
          ×
        </button>
      </div>
      <p class="mt-2 text-[15px] leading-6 text-muted">
        Que apunte la cámara del celular: se abre la pantalla para dejarte la reseña.
      </p>
      @if (png()) {
        <img
          [src]="png()"
          width="280"
          height="280"
          class="mx-auto mt-5 max-w-full rounded-lg"
          alt="Código QR para dejar una reseña"
        />
        <a
          [href]="png()"
          download="resuelve-resenas-qr.png"
          class="button-secondary mt-4 flex min-h-12 items-center justify-center rounded-xl px-4 text-[16px] font-semibold"
          >Descargar PNG</a
        >
      } @else {
        <p class="py-8 text-center text-[15px]" role="status">{{ qrError() || 'Generando QR…' }}</p>
      }
      <a [href]="url()" class="mt-3 block text-center text-sm break-all text-brand underline">{{ url() }}</a>
    </app-dialog>
  `,
})
export class ReviewInvite {
  readonly profile = input.required<{ id: string; slug?: string; firstName?: string }>();
  private readonly links = inject(PublicLinks);

  protected readonly url = computed(() => this.links.review(this.profile()));
  protected readonly whatsapp = computed(
    () =>
      'https://wa.me/?text=' +
      encodeURIComponent(
        `¡Hola! Gracias por confiar en mí. Si tenés un minuto, ¿me dejás una reseña? Es solo tocar unas estrellas:\n${this.url()}`,
      ),
  );
  protected readonly open = signal(false);
  protected readonly png = signal('');
  protected readonly qrError = signal('');
  protected readonly notice = signal('');

  protected async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.url());
      this.notice.set('Enlace copiado.');
    } catch {
      this.notice.set('No pudimos copiarlo. Usá el botón de WhatsApp o el QR.');
    }
  }

  protected async showQr(): Promise<void> {
    this.open.set(true);
    if (this.png()) return;
    this.qrError.set('');
    try {
      this.png.set(await qrPngDataUrl(this.url()));
    } catch {
      this.qrError.set('No pudimos generar el QR. Podés usar el enlace.');
    }
  }
}
