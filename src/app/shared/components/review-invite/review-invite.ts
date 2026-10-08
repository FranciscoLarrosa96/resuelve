import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
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
  host: { class: 'block min-w-0 h-full' },
  // El QR siempre sobre blanco (se lee igual en tema oscuro), como el PNG que se descarga.
  styles: `
    .qr-thumb {
      background: var(--color-qr-ground);
      border: 1px solid var(--color-line);
    }
  `,
  template: `
    @if (compact()) {
      <!-- Versión corta para el Inicio: bloque secundario, sin botones rellenos. -->
      <section
        id="pedir-resenas"
        class="grid h-full scroll-mt-6 content-start gap-3.5 rounded-2xl border border-line-soft bg-canvas p-4.5 md:p-5"
        aria-labelledby="review-invite-title"
      >
        <div class="flex items-start gap-3.5">
          <button
            type="button"
            class="qr-thumb block size-16 shrink-0 rounded-lg p-1"
            aria-label="Ampliar el QR para dejar una reseña"
            (click)="showQr()"
          >
            @if (png()) {
              <img
                [src]="png()"
                width="56"
                height="56"
                class="block size-full rounded-sm"
                alt=""
                data-testid="review-invite-qr-thumb"
              />
            }
          </button>
          <div class="min-w-0">
            <h2 id="review-invite-title" class="text-[16.5px] leading-snug font-bold text-balance">
              Sumá reseñas de tus clientes de siempre
            </h2>
            <p class="mt-1 text-[14px] leading-5 text-ink-soft">
              Para trabajos por fuera de Resuelve: puntúan sin crear cuenta, se muestran aparte y no
              cambian tu puntaje.
            </p>
          </div>
        </div>
        <div class="flex flex-wrap gap-2">
          <a
            [href]="whatsapp()"
            target="_blank"
            rel="noopener noreferrer"
            class="button-secondary inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-[14.5px] font-semibold"
            data-testid="review-invite-whatsapp"
          >
            <app-icon name="message" [size]="16" aria-hidden="true" />
            WhatsApp
          </a>
          <button
            type="button"
            class="button-secondary inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-[14.5px] font-semibold"
            data-testid="review-invite-qr"
            (click)="showQr()"
          >
            <app-icon name="qr" [size]="16" aria-hidden="true" />
            Mostrar QR
          </button>
          <button
            type="button"
            class="button-secondary inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-[14.5px] font-semibold"
            (click)="copy()"
          >
            <app-icon [name]="copied() ? 'check' : 'copy'" [size]="16" aria-hidden="true" />
            {{ copied() ? 'Copiado' : 'Copiar enlace' }}
          </button>
        </div>
        <p role="status" class="text-[14px] text-muted empty:hidden">{{ notice() }}</p>
      </section>
    } @else {
    <section
      id="pedir-resenas"
      class="grid scroll-mt-6 gap-5 rounded-2xl bg-surface p-4.5 md:grid-cols-[minmax(0,1fr)_168px] md:items-center md:gap-8 md:p-6"
      aria-labelledby="review-invite-title"
    >
      <div class="grid min-w-0 gap-2.5">
        <span
          class="inline-flex items-center gap-1.5 justify-self-start rounded-full bg-sand px-2.5 py-1 text-[13px] font-semibold text-ink-soft"
          ><app-icon name="info" [size]="14" aria-hidden="true" />Para trabajos por fuera de Resuelve</span
        >
        <h2
          id="review-invite-title"
          class="font-sans text-[20px] leading-tight font-bold tracking-[-0.015em] text-balance md:text-[22px]"
        >
          Sumá reseñas de tus clientes de siempre
        </h2>
        <p class="max-w-[60ch] text-[15px] leading-6 text-ink-soft">
          Mandales tu enlace o mostrales el QR: puntúan en un toque, sin crear cuenta. Se muestran
          aparte en tu perfil, como «Cliente invitado por el profesional», y no cambian tu puntaje.
        </p>
        <div class="mt-1.5 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <a
            [href]="whatsapp()"
            target="_blank"
            rel="noopener noreferrer"
            class="button-primary col-span-2 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-5 text-[15.5px] font-semibold"
            data-testid="review-invite-whatsapp"
          >
            <app-icon name="message" [size]="18" aria-hidden="true" />
            Mandar por WhatsApp
          </a>
          <button
            type="button"
            class="button-secondary inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 text-[15.5px] font-semibold"
            data-testid="review-invite-qr"
            (click)="showQr()"
          >
            <app-icon name="qr" [size]="18" aria-hidden="true" />
            Mostrar QR
          </button>
          <button
            type="button"
            class="button-secondary inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 text-[15.5px] font-semibold"
            (click)="copy()"
          >
            <app-icon [name]="copied() ? 'check' : 'copy'" [size]="18" aria-hidden="true" />
            {{ copied() ? 'Copiado' : 'Copiar enlace' }}
          </button>
        </div>
        <p role="status" class="text-[14px] text-muted empty:hidden">{{ notice() }}</p>
      </div>

      <!-- El QR a la vista: en mobile va arriba, al lado de una frase. -->
      <div
        class="-order-1 grid grid-cols-[96px_minmax(0,1fr)] items-center gap-3.5 rounded-xl bg-sand p-3 md:order-none md:grid-cols-1 md:justify-items-center md:gap-2 md:bg-transparent md:p-0"
      >
        <button
          type="button"
          class="qr-thumb block w-full rounded-xl p-2"
          aria-label="Ampliar el QR para dejar una reseña"
          (click)="showQr()"
        >
          @if (png()) {
            <img
              [src]="png()"
              width="152"
              height="152"
              class="block aspect-square w-full rounded-md"
              alt=""
              data-testid="review-invite-qr-thumb"
            />
          } @else {
            <span class="block aspect-square w-full" aria-hidden="true"></span>
          }
        </button>
        <div class="grid gap-0.5 text-[14px] text-ink-soft md:hidden">
          <strong class="text-ink">Mostralo en persona</strong>
          Que apunte la cámara del celular.
        </div>
        <button
          type="button"
          class="hidden min-h-9 px-1 text-[14px] font-semibold text-brand hover:underline md:block"
          (click)="showQr()"
        >
          Ampliar y descargar
        </button>
      </div>
    </section>
    }

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
  /** Versión corta para el Inicio: secundaria, al lado de "Invitar colegas". */
  readonly compact = input(false);
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
  /** "Copiado" en el propio botón unos segundos; el aviso lo lee el lector de pantalla. */
  protected readonly copied = signal(false);
  private copiedTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.copiedTimer));
    // El QR a la vista se genera en el navegador (en el servidor no hay canvas).
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      effect(() => void this.generate(this.url()));
    }
  }

  private async generate(url: string): Promise<void> {
    this.qrError.set('');
    try {
      const png = await qrPngDataUrl(url);
      if (url === this.url()) this.png.set(png);
    } catch {
      this.qrError.set('No pudimos generar el QR. Podés usar el enlace.');
    }
  }

  protected async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.url());
      this.notice.set('Enlace copiado.');
      this.copied.set(true);
      clearTimeout(this.copiedTimer);
      this.copiedTimer = setTimeout(() => this.copied.set(false), 2500);
    } catch {
      this.notice.set('No pudimos copiarlo. Usá el botón de WhatsApp o el QR.');
    }
  }

  protected showQr(): void {
    this.open.set(true);
    if (!this.png()) void this.generate(this.url());
  }
}
