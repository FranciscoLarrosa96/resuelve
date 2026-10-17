import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { OwnProfessional } from '../../core/models/pro-profile';
import { Icon } from '../../shared/components/icon/icon';
import { ProfileShare } from '../../shared/components/profile-share/profile-share';
import { AvatarEditor } from './profile/avatar-editor';
import { ActivationTip } from './activation';

/**
 * Una sugerencia de los primeros pasos (`activationTips`): mismo texto y acción en la bienvenida del alta y
 * en el Inicio. El anfitrión pone la tarjeta; esto solo dibuja el contenido (`display: contents`).
 */
@Component({
  selector: 'app-activation-tip',
  imports: [RouterLink, Icon, ProfileShare, AvatarEditor],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  template: `
    @switch (tip()) {
      @case ('AVATAR') {
        <div class="flex items-start gap-3">
          <app-avatar-editor class="shrink-0" [compact]="true" />
          <div class="min-w-0">
            <h3 class="text-[15.5px] font-bold">Sumá tu foto</h3>
            <p class="mt-0.5 text-[14px] leading-5 text-ink-soft">Una foto tuya ayuda a que te reconozcan cuando llegás.</p>
          </div>
        </div>
      }
      @case ('SHARE') {
        <div class="flex items-start gap-3">
          <span class="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand" aria-hidden="true"
            ><app-icon name="share" [size]="17" [stroke]="2"
          /></span>
          <div class="min-w-0">
            <h3 class="text-[15.5px] font-bold">Compartí tu perfil</h3>
            <p class="mt-0.5 text-[14px] leading-5 text-ink-soft">Enviá tu enlace a tus clientes y contactos.</p>
          </div>
        </div>
        <app-profile-share class="mt-auto" [profile]="profile()" [own]="true" [primary]="true" [withCopy]="withCopy()" label="Compartir mi perfil" />
      }
      @case ('PHOTOS') {
        <div class="flex items-start gap-3">
          <span class="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand" aria-hidden="true"
            ><app-icon name="camera" [size]="17" [stroke]="2"
          /></span>
          <div class="min-w-0">
            <h3 class="text-[15.5px] font-bold">Mostrá tus trabajos</h3>
            <p class="mt-0.5 text-[14px] leading-5 text-ink-soft">Agregá fotos para que puedan conocer tu experiencia.</p>
          </div>
        </div>
        <a
          routerLink="/pro/perfil"
          [queryParams]="{ editar: 'portfolio' }"
          class="button-secondary mt-auto inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-[14.5px] font-semibold"
          >Agregar fotos</a
        >
      }
      @case ('REVIEW') {
        <div class="flex items-start gap-3">
          <span class="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand" aria-hidden="true"
            ><app-icon name="star" [size]="17" [stroke]="2"
          /></span>
          <div class="min-w-0">
            <h3 class="text-[15.5px] font-bold">Pedí tu primera reseña</h3>
            <p class="mt-0.5 text-[14px] leading-5 text-ink-soft">Invitá a un cliente habitual a contar cómo fue tu trabajo.</p>
          </div>
        </div>
        <button
          type="button"
          class="button-secondary mt-auto inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-[14.5px] font-semibold"
          (click)="reviewRequested.emit()"
        >
          Pedir una reseña
        </button>
      }
      @case ('CONTACT') {
        <div class="flex items-start gap-3">
          <span class="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand" aria-hidden="true"
            ><app-icon name="chat" [size]="17" [stroke]="2"
          /></span>
          <div class="min-w-0">
            <h3 class="text-[15.5px] font-bold">Sumá WhatsApp o llamadas</h3>
            <p class="mt-0.5 text-[14px] leading-5 text-ink-soft">Elegí si querés que tus clientes te escriban o te llamen.</p>
          </div>
        </div>
        <a
          routerLink="/pro/perfil"
          [queryParams]="{ editar: 'contact' }"
          class="button-secondary mt-auto inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-[14.5px] font-semibold"
          >Configurar</a
        >
      }
    }
  `,
})
export class ActivationTipContent {
  readonly tip = input.required<ActivationTip>();
  readonly profile = input.required<OwnProfessional>();
  readonly withCopy = input(false);
  /** "Pedir una reseña": el anfitrión decide adónde lleva (en el Inicio baja a "Sumá reseñas"). */
  readonly reviewRequested = output<void>();
}
