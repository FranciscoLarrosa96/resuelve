import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AVATAR_MESSAGES, AVATAR_MIME_TYPES, ProStore } from '../../../core/state/pro.store';
import { Avatar } from '../../../shared/components/avatar/avatar';
import { Icon } from '../../../shared/components/icon/icon';

/**
 * Foto de perfil en /pro/perfil: subir, reemplazar o eliminar. Sin foto,
 * iniciales. La foto no es una verificación de identidad (eso es otra señal).
 * Cualquier proporción: Cloudinary la entrega cuadrada (256×256, recorte automático).
 */
@Component({
  selector: 'app-avatar-editor',
  imports: [Avatar, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col items-center gap-2' },
  template: `
    @if (store.me(); as subject) {
      <div class="relative">
        <app-avatar
          [subject]="subject"
          [alt]="hasPhoto() ? 'Tu foto de perfil' : null"
          class="size-20 rounded-2xl text-2xl"
          data-testid="own-avatar"
        />
        @if (busy()) {
          <span class="absolute inset-0 grid place-items-center rounded-2xl bg-ink/45" aria-hidden="true">
            <span class="size-6 animate-spin rounded-full border-[2.5px] border-white/40 border-t-white"></span>
          </span>
        }
      </div>
    }
    <div class="flex items-center gap-1">
      <input
        #file
        id="avatar-file"
        type="file"
        class="peer sr-only"
        [attr.accept]="accept"
        [disabled]="busy()"
        aria-describedby="avatar-help"
        (change)="onFile(file)"
      />
      <label
        for="avatar-file"
        class="flex h-9 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-[13.5px] font-semibold text-brand peer-focus-visible:outline-2 peer-focus-visible:outline-brand hover:bg-brand-tint peer-disabled:cursor-not-allowed peer-disabled:opacity-55"
      >
        <app-icon name="camera" [size]="15" />{{ hasPhoto() ? 'Cambiar foto' : 'Subir foto' }}
      </label>
      @if (hasPhoto()) {
        <button type="button" class="flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[13.5px] font-semibold text-ink-soft hover:bg-sand disabled:opacity-55" [disabled]="busy()" (click)="store.removeAvatar()">
          <app-icon name="trash" [size]="15" />Eliminar<span class="sr-only"> foto</span>
        </button>
      }
    </div>
    <p id="avatar-help" class="sr-only">JPG, PNG o WebP de hasta 5 MB. Se muestra cuadrada en tu perfil y en los resultados.</p>
    @if (store.avatarUpload(); as up) {
      @if (up.phase === 'uploading') {
        <div class="h-1.5 w-28 overflow-hidden rounded-full bg-track" role="progressbar" aria-label="Subida de la foto" [attr.aria-valuenow]="up.progress" aria-valuemin="0" aria-valuemax="100">
          <div class="h-full rounded-full bg-brand transition-[width] duration-150" [style.width.%]="up.progress"></div>
        </div>
      }
      <p class="text-[12.5px] text-muted" role="status">{{ phaseText() }}</p>
    }
    @if (store.avatarError(); as err) {
      <div class="max-w-56 text-center text-[12.5px] leading-[1.4] text-danger" role="alert">
        {{ err }}
        @if (lastFile()) {
          <button type="button" class="ml-1 font-semibold text-ink underline underline-offset-2" (click)="retry()">Reintentar</button>
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
      ({ signing: 'Preparando…', uploading: 'Subiendo foto…', saving: 'Guardando…', removing: 'Eliminando…' })[
        this.store.avatarUpload()?.phase ?? 'signing'
      ],
  );

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
    this.lastFile.set(!ok && this.store.avatarError() === AVATAR_MESSAGES.uploadFailed ? file : null);
  }
}
