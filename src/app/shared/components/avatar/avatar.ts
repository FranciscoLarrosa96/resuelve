import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { AvatarSubject } from '../../../core/models/professional';

/**
 * Foto del profesional con fallback a iniciales.
 * El tamaño, radio y tipografía los define quien lo usa vía `class`.
 */
@Component({
  selector: 'app-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden font-bold',
    '[style.background]': 'subject().tone.bg',
    '[style.color]': 'subject().tone.fg',
    // Con nombre al lado (alt=""), el avatar es decorativo y se oculta a lectores de pantalla.
    '[attr.role]': "label() ? 'img' : null",
    '[attr.aria-label]': 'label() || null',
    '[attr.aria-hidden]': "label() ? null : 'true'",
  },
  template: `
    <span aria-hidden="true">{{ subject().initials }}</span>
    @if (showPhoto()) {
      <img
        [src]="subject().photoUrl"
        alt=""
        loading="lazy"
        decoding="async"
        class="absolute inset-0 size-full object-cover"
        (error)="failed.set(true)"
      />
    }
  `,
})
export class Avatar {
  readonly subject = input.required<AvatarSubject>();
  /** El diseño mobile usa iniciales; desktop usa foto. */
  readonly photo = input(true);
  /** Texto accesible; vacío si el nombre ya está al lado. */
  readonly alt = input<string | null>(null);

  protected readonly failed = signal(false);
  protected readonly showPhoto = computed(() => this.photo() && !!this.subject().photoUrl && !this.failed());
  protected readonly label = computed(() => this.alt() ?? this.subject().name);
}
