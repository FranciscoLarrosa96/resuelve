import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AVATAR_MIME_TYPES, ProStore } from '../../../core/state/pro.store';
import { Icon } from '../../../shared/components/icon/icon';

/**
 * Foto de portada en Mi perfil (beneficio PRO). PRO: subir, cambiar o quitar.
 * Free: qué suma PRO acá, sin cifras ni promesas; si tenía una guardada de cuando
 * fue PRO, se avisa que vuelve a verse con PRO y se puede quitar.
 */
@Component({
  selector: 'app-cover-editor',
  imports: [Icon, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <input
      #file
      id="cover-file"
      type="file"
      class="sr-only"
      tabindex="-1"
      aria-label="Elegir foto de portada"
      [attr.accept]="accept"
      [disabled]="busy() || !canUse()"
      (change)="onFile(file)"
    />
    @if (canUse()) {
      @if (cover(); as url) {
        <div class="relative overflow-hidden rounded-t-[inherit] bg-sand" data-testid="cover-current">
          <img [src]="url" alt="Tu foto de portada" class="aspect-[3/1] max-h-56 w-full object-cover" />
          <!-- Fondo sólido: sobre cualquier foto (clara u oscura) los botones se leen. -->
          <div class="absolute inset-x-3 bottom-3 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              class="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3.5 text-[14px] font-semibold border border-line-btn bg-surface text-ink shadow-soft hover:bg-sand disabled:cursor-not-allowed disabled:opacity-55"
              [disabled]="busy()"
              (click)="file.click()"
            >
              <app-icon name="camera" [size]="15" />Cambiar portada
            </button>
            <button
              type="button"
              class="inline-flex min-h-11 items-center rounded-xl px-3.5 text-[14px] font-semibold border border-line-btn bg-surface text-ink shadow-soft hover:bg-sand disabled:cursor-not-allowed disabled:opacity-55"
              [disabled]="busy()"
              (click)="remove()"
            >
              Quitar
            </button>
          </div>
        </div>
      } @else {
        <button
          type="button"
          class="flex w-full flex-col items-center justify-center gap-1 rounded-t-[inherit] border-b border-dashed border-brand-line bg-brand-tint px-4 py-6 text-center hover:bg-brand-soft"
          [disabled]="busy()"
          data-testid="cover-add"
          (click)="file.click()"
        >
          <span class="inline-flex items-center gap-2 text-[15px] font-bold text-brand"
            ><app-icon name="camera" [size]="16" />Sumá una foto de portada</span
          >
          <span class="text-[13.5px] text-ink-soft"
            >Va arriba de tu perfil público. Ideal: un trabajo terminado o tu taller, horizontal.</span
          >
        </button>
      }
    } @else {
      <div
        class="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-t-[inherit] border-b border-dashed border-line bg-sand px-5 py-4 md:px-6"
        data-testid="cover-locked"
      >
        <span class="grid size-9 shrink-0 place-items-center rounded-lg bg-surface text-muted" aria-hidden="true"
          ><app-icon name="lock" [size]="16"
        /></span>
        <p class="min-w-0 flex-1 basis-60 text-[14px] leading-5 text-ink-soft">
          <b class="text-ink">Foto de portada · Resuelve PRO.</b>
          @if (saved()) {
            Tu portada está guardada y se vuelve a ver cuando tengas PRO.
          } @else {
            Una imagen grande arriba de tu perfil, para que te reconozcan de un vistazo.
          }
        </p>
        @if (saved()) {
          <button type="button" class="text-[14px] font-semibold text-brand hover:underline" [disabled]="busy()" (click)="remove()">
            Quitar portada
          </button>
        }
        <a routerLink="/pro/plan" class="text-[14px] font-semibold text-brand hover:underline">Conocer PRO</a>
      </div>
    }
    @if (busy(); as b) {
      <p class="px-5 pt-2 text-[13px] text-muted md:px-6" role="status">
        {{ b.phase === 'removing' ? 'Quitando la portada…' : 'Subiendo la portada… ' + b.progress + '%' }}
      </p>
    }
    @if (store.coverError(); as error) {
      <p class="px-5 pt-2 text-[13.5px] font-medium text-danger md:px-6" role="alert">{{ error }}</p>
    }
  `,
})
export class CoverEditor {
  protected readonly store = inject(ProStore);
  protected readonly accept = AVATAR_MIME_TYPES.join(',');
  protected readonly canUse = computed(() => !!this.store.entitlements()?.canUseCoverPhoto);
  protected readonly cover = computed(() => this.store.ownProfile()?.coverUrl ?? null);
  protected readonly saved = computed(() => !!this.store.ownProfile()?.savedCoverUrl);
  protected readonly busy = this.store.coverUpload;

  protected onFile(input: HTMLInputElement): void {
    const file = input.files?.[0];
    input.value = '';
    if (file) void this.store.uploadCover(file);
  }

  protected remove(): void {
    void this.store.removeCover();
  }
}
