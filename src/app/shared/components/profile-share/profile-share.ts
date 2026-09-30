import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { PublicLinks } from '../../../core/acquisition/public-links';
import { Dialog } from '../dialog/dialog';

@Component({
  selector: 'app-profile-share',
  imports: [Dialog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
  template: `
    @if (compact()) {
      <section class="my-6 border-y border-line py-5" aria-labelledby="share-profile-title">
        <h2 id="share-profile-title" class="text-lg font-semibold">Compartí tu perfil</h2>
        <p class="mt-1 text-sm text-muted">
          Tu enlace para que puedan conocerte y pedirte presupuesto.
        </p>
        <a
          [href]="url()"
          class="mt-3 block break-all text-sm text-brand underline underline-offset-4"
          >{{ url() }}</a
        >
        <div class="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            class="button-primary min-h-11 rounded-xl px-4 text-sm font-semibold"
            (click)="share()"
          >
            Compartir
          </button>
          <button
            type="button"
            class="button-secondary min-h-11 rounded-xl px-4 text-sm font-semibold"
            (click)="copy()"
          >
            Copiar enlace
          </button>
          <button
            type="button"
            class="min-h-11 px-4 text-sm font-semibold text-brand"
            (click)="showQr()"
          >
            Mostrar QR
          </button>
        </div>
      </section>
    } @else {
      <button
        type="button"
        class="button-secondary min-h-11 w-full rounded-xl px-4 text-sm font-semibold"
        (click)="share()"
      >
        Compartir perfil
      </button>
    }
    <p class="mt-1 text-xs text-muted" role="status">{{ notice() }}</p>
    <app-dialog [open]="open()" labelledBy="profile-share-dialog-title" (dismiss)="close()">
      <div class="flex items-center justify-between gap-4">
        <h2 id="profile-share-dialog-title" class="font-display text-2xl font-bold">
          {{ qrMode() ? 'Tu perfil, en un QR' : 'Compartir perfil' }}
        </h2>
        <button
          type="button"
          class="grid size-11 shrink-0 place-items-center rounded-xl button-secondary"
          aria-label="Cerrar compartir perfil"
          (click)="close()"
        >
          ×
        </button>
      </div>
      <p class="mt-2 text-sm leading-6 text-muted">{{ profile().displayName }} · Resuelve</p>
      @if (qrMode()) {
        @if (png()) {
          <img
            [src]="png()"
            width="280"
            height="280"
            class="mx-auto mt-5 max-w-full rounded-lg"
            alt="Código QR para abrir el perfil profesional"
          />
        } @else {
          <p class="py-8 text-center text-sm" role="status">{{ qrError() || 'Generando QR…' }}</p>
        }
        <a [href]="qrUrl()" class="mt-3 block break-all text-center text-sm text-brand underline">{{
          qrUrl()
        }}</a>
        @if (png()) {
          <a
            [href]="png()"
            download="resuelve-perfil-qr.png"
            class="button-primary mt-4 flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold"
            >Descargar PNG</a
          >
        }
        <button
          type="button"
          class="mt-3 min-h-11 w-full text-sm font-semibold text-brand"
          (click)="qrMode.set(false)"
        >
          Volver a compartir
        </button>
      } @else {
        <label class="mt-4 block text-xs font-semibold" for="share-link">Enlace público</label>
        <input
          id="share-link"
          readonly
          [value]="url()"
          class="field-control mt-2 h-11 w-full min-w-0 rounded-xl px-3 text-sm"
          (focus)="$any($event.target).select()"
        />
        <p class="mt-3 text-sm text-muted">
          Podés ver este perfil profesional en Resuelve y pedir presupuesto.
        </p>
        <div class="mt-5 flex flex-col gap-2">
          <a
            [href]="whatsapp()"
            target="_blank"
            rel="noopener noreferrer"
            class="button-primary flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold"
            >WhatsApp</a
          >
          <button
            type="button"
            class="button-secondary min-h-11 rounded-xl px-4 text-sm font-semibold"
            (click)="copy()"
          >
            Copiar enlace
          </button>
          <button
            type="button"
            class="min-h-11 text-sm font-semibold text-brand"
            (click)="showQr()"
          >
            Mostrar QR
          </button>
        </div>
      }
      <p class="mt-2 text-sm text-muted" role="status">{{ notice() }}</p>
    </app-dialog>
  `,
})
export class ProfileShare {
  readonly profile = input.required<{ id: string; slug?: string; displayName: string }>();
  readonly compact = input(false);
  private readonly links = inject(PublicLinks);
  protected readonly url = computed(() => this.links.profile(this.profile(), 'share'));
  protected readonly qrUrl = computed(() => this.links.profile(this.profile(), 'qr'));
  private readonly shareText = computed(() =>
    this.compact()
      ? 'Podés ver mi perfil profesional en Resuelve y pedirme presupuesto:'
      : `Podés ver el perfil de ${this.profile().displayName} en Resuelve y pedirle presupuesto:`,
  );
  protected readonly whatsapp = computed(
    () => 'https://wa.me/?text=' + encodeURIComponent(`${this.shareText()}\n${this.url()}`),
  );
  protected readonly open = signal(false);
  protected readonly qrMode = signal(false);
  protected readonly png = signal('');
  protected readonly qrError = signal('');
  protected readonly notice = signal('');
  protected close(): void {
    this.open.set(false);
    this.notice.set('');
  }
  protected async share(): Promise<void> {
    this.notice.set('');
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: `${this.profile().displayName} · Resuelve`,
          text: this.shareText(),
          url: this.url(),
        });
        return;
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') return;
      }
    }
    this.qrMode.set(false);
    this.open.set(true);
  }
  protected async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.url());
      this.notice.set('Enlace copiado.');
    } catch {
      this.open.set(true);
      this.qrMode.set(false);
      this.notice.set('Seleccioná el enlace y copialo con el menú de tu dispositivo.');
    }
  }
  protected async showQr(): Promise<void> {
    this.qrMode.set(true);
    this.open.set(true);
    this.qrError.set('');
    this.png.set('');
    try {
      const { default: qrcode } = await import('qrcode-generator');
      const qr = qrcode(0, 'M');
      qr.addData(this.qrUrl());
      qr.make();
      const count = qr.getModuleCount(),
        cell = 8,
        margin = 4;
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = (count + 2 * margin) * cell;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas unavailable');
      // Machine-readable export: high contrast and the required four-module quiet zone.
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#153942';
      for (let row = 0; row < count; row++)
        for (let col = 0; col < count; col++)
          if (qr.isDark(row, col))
            ctx.fillRect((col + margin) * cell, (row + margin) * cell, cell, cell);
      this.png.set(canvas.toDataURL('image/png'));
    } catch {
      this.qrError.set('No pudimos generar el QR. Podés usar el enlace público.');
    }
  }
}
