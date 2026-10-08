import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { AVATAR_MESSAGES, AVATAR_MIME_TYPES, ProStore } from '../../../core/state/pro.store';
import { Avatar } from '../../../shared/components/avatar/avatar';
import { Icon } from '../../../shared/components/icon/icon';

/**
 * Foto de perfil en /pro/perfil: subir, reemplazar o eliminar. Sin foto,
 * iniciales. La foto no es una verificación de identidad (eso es otra señal).
 * Cualquier proporción: Cloudinary la entrega cuadrada (256×256, recorte automático).
 * El botón de cámara sobre la foto sube directo (sin foto) o abre "Cambiar / Eliminar".
 */
@Component({
  selector: 'app-avatar-editor',
  imports: [Avatar, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'flex flex-col items-start gap-2',
    '(document:click)': 'onDocumentClick($event)',
    '(keydown.escape)': 'closeMenu(true)',
  },
  template: `
    <input
      #file
      id="avatar-file"
      type="file"
      class="sr-only"
      tabindex="-1"
      aria-label="Elegir foto de perfil"
      [attr.accept]="accept"
      [disabled]="busy()"
      aria-describedby="avatar-help"
      (change)="onFile(file)"
    />
    <div class="relative">
      @if (store.me(); as subject) {
        <app-avatar
          [subject]="subject"
          [alt]="hasPhoto() ? 'Tu foto de perfil' : null"
          class="size-20 rounded-2xl text-[28px] md:size-24 md:text-[32px]"
          data-testid="own-avatar"
        />
      }
      @if (busy()) {
        <span
          class="absolute inset-0 grid place-items-center rounded-2xl bg-scrim/45"
          aria-hidden="true"
        >
          <span
            class="size-6 animate-spin rounded-full border-[2.5px] border-white/40 border-t-white"
          ></span>
        </span>
      }
      @if (hasPhoto()) {
        <button
          type="button"
          class="avatar-camera absolute -right-2 -bottom-2 grid size-9 place-items-center rounded-full border border-line-btn bg-surface text-ink shadow-soft hover:bg-sand disabled:cursor-not-allowed disabled:opacity-55"
          aria-haspopup="menu"
          aria-controls="avatar-menu"
          [attr.aria-expanded]="menuOpen()"
          [disabled]="busy()"
          (click)="toggleMenu()"
        >
          <app-icon name="camera" [size]="16" /><span class="sr-only">Foto de perfil</span>
        </button>
        @if (menuOpen()) {
          <div
            id="avatar-menu"
            role="menu"
            aria-label="Foto de perfil"
            class="absolute top-[calc(100%+8px)] left-0 z-20 flex min-w-48 flex-col rounded-xl border border-line bg-surface p-1.5 shadow-soft animate-fade-in"
          >
            <button
              type="button"
              role="menuitem"
              class="flex min-h-11 items-center gap-2 rounded-lg px-3 text-left text-[14.5px] font-semibold hover:bg-sand"
              (click)="pick(file)"
            >
              <app-icon name="camera" [size]="15" />Cambiar foto
            </button>
            <button
              type="button"
              role="menuitem"
              class="flex min-h-11 items-center gap-2 rounded-lg px-3 text-left text-[14.5px] font-semibold text-danger hover:bg-danger-soft"
              (click)="remove()"
            >
              <app-icon name="trash" [size]="15" />Eliminar foto
            </button>
          </div>
        }
      } @else {
        <button
          type="button"
          class="avatar-camera absolute -right-2 -bottom-2 grid size-9 place-items-center rounded-full border border-line-btn bg-surface text-ink shadow-soft hover:bg-sand disabled:cursor-not-allowed disabled:opacity-55"
          [disabled]="busy()"
          (click)="pick(file)"
        >
          <app-icon name="camera" [size]="16" /><span class="sr-only">Subir foto</span>
        </button>
      }
    </div>
    <p id="avatar-help" class="sr-only">
      JPG, PNG o WebP de hasta 5 MB. Se muestra cuadrada en tu perfil y en los resultados.
    </p>
    @if (store.avatarUpload(); as up) {
      @if (up.phase === 'uploading') {
        <div
          class="h-1.5 w-20 overflow-hidden rounded-full bg-track md:w-24"
          role="progressbar"
          aria-label="Subida de la foto"
          [attr.aria-valuenow]="up.progress"
          aria-valuemin="0"
          aria-valuemax="100"
        >
          <div
            class="h-full rounded-full bg-brand transition-[width] duration-150"
            [style.width.%]="up.progress"
          ></div>
        </div>
      }
      <p class="text-[14px] text-muted" role="status">{{ phaseText() }}</p>
    }
    @if (store.avatarError(); as err) {
      <div class="max-w-56 text-[14px] leading-[1.4] text-danger" role="alert">
        {{ err }}
        @if (lastFile()) {
          <button
            type="button"
            class="ml-1 font-semibold text-ink underline underline-offset-2"
            (click)="retry()"
          >
            Reintentar
          </button>
        }
      </div>
    }
  `,
})
export class AvatarEditor {
  protected readonly store = inject(ProStore);
  protected readonly accept = AVATAR_MIME_TYPES.join(',');
  protected readonly hasPhoto = computed(() => !!this.store.ownProfile()?.avatarUrl);
  protected readonly busy = computed(() => !!this.store.avatarUpload());
  protected readonly lastFile = signal<File | null>(null);
  protected readonly phaseText = computed(
    () =>
      ({
        signing: 'Preparando…',
        uploading: 'Subiendo foto…',
        saving: 'Guardando…',
        removing: 'Eliminando…',
      })[this.store.avatarUpload()?.phase ?? 'signing'],
  );

  protected readonly menuOpen = signal(false);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected toggleMenu(): void {
    this.menuOpen.update((v) => !v);
  }

  protected closeMenu(restoreFocus = false): void {
    if (!this.menuOpen()) return;
    this.menuOpen.set(false);
    if (restoreFocus)
      this.host.nativeElement.querySelector<HTMLButtonElement>('.avatar-camera')?.focus();
  }

  protected onDocumentClick(event: Event): void {
    if (!this.host.nativeElement.contains(event.target as Node)) this.closeMenu();
  }

  protected pick(input: HTMLInputElement): void {
    this.menuOpen.set(false);
    input.click();
  }

  protected remove(): void {
    this.menuOpen.set(false);
    void this.store.removeAvatar();
  }

  protected async onFile(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    await this.send(file);
  }

  protected async retry(): Promise<void> {
    const file = this.lastFile();
    if (file) await this.send(file);
  }

  /** "Reintentar" solo tiene sentido si falló la red/subida (no si el archivo es inválido). */
  private async send(file: File): Promise<void> {
    const ok = await this.store.uploadAvatar(file);
    this.lastFile.set(
      !ok && this.store.avatarError() === AVATAR_MESSAGES.uploadFailed ? file : null,
    );
  }
}
