import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { PublicLinks } from '../../../core/acquisition/public-links';
import { qrPngDataUrl } from '../../../core/utils/qr-png';
import { Icon } from '../icon/icon';
import { Dialog } from '../dialog/dialog';

@Component({
  selector: 'app-profile-share',
  imports: [Dialog, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
  styles: `
    .share-action {
      min-height: 44px;
      padding-inline: 8px;
      font-size: 14.5px;
      font-weight: 600;
      color: var(--color-brand);
      border-radius: 8px;
    }
    .share-action:hover {
      text-decoration: underline;
      text-underline-offset: 3px;
    }
  `,
  template: `
    @if (compact()) {
      <div class="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        <span
          class="min-w-0 truncate font-mono text-[13.5px] text-muted"
          data-testid="profile-share-url"
          >{{ displayUrl() }}</span
        >
        <div class="-mx-2 flex flex-wrap items-center">
          <button type="button" class="share-action" (click)="copy()">Copiar enlace</button>
          <button type="button" class="share-action" (click)="share()">Compartir</button>
          <button type="button" class="share-action" (click)="showQr()">
            QR<span class="sr-only"> de tu perfil</span>
          </button>
        </div>
        <span class="flex items-center gap-1.5 text-[14px] text-muted" role="status">
          @if (notice() && !open()) {
            <app-icon
              name="check"
              [size]="13"
              [stroke]="3"
              class="animate-pop text-brand"
              aria-hidden="true"
            />{{ notice() }}
          }
        </span>
      </div>
    } @else {
      <button
        type="button"
        class="button-secondary min-h-11 w-full rounded-xl px-4 text-sm font-semibold"
        (click)="share()"
      >
        Compartir perfil
      </button>
      <p class="mt-1 flex items-center gap-1.5 text-xs text-muted" role="status">
        @if (notice()) {
          <app-icon
            name="check"
            [size]="12"
            [stroke]="3"
            class="animate-pop text-brand"
            aria-hidden="true"
          />
        }
        {{ notice() }}
      </p>
    }
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
      <p class="mt-2 flex items-center gap-1.5 text-sm text-muted" role="status">
        @if (notice()) {
          <app-icon
            name="check"
            [size]="14"
            [stroke]="3"
            class="animate-pop text-brand"
            aria-hidden="true"
          />
        }
        {{ notice() }}
      </p>
    </app-dialog>
  `,
})
export class ProfileShare {
  readonly profile = input.required<{ id: string; slug?: string; displayName: string }>();
  readonly compact = input(false);
  private readonly links = inject(PublicLinks);
  protected readonly url = computed(() => this.links.profile(this.profile(), 'share'));
  /** Lo que se lee en la barra: sin protocolo ni `?src` (se copia el enlace completo). */
  protected readonly displayUrl = computed(() =>
    this.links.profile(this.profile()).replace(/^https?:\/\//, ''),
  );
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
      this.png.set(await qrPngDataUrl(this.qrUrl()));
    } catch {
      this.qrError.set('No pudimos generar el QR. Podés usar el enlace público.');
    }
  }
}
