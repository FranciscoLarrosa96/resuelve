import { ChangeDetectionStrategy, Component, computed, effect, inject, input, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { CurrentRoute } from '../../../core/services/current-route.service';
import { ToastService } from '../../../core/services/toast.service';
import { AuthStore } from '../../../core/state/auth.store';
import { MyProfessionalsStore } from '../../../core/state/my-professionals.store';
import { Icon } from '../icon/icon';

/**
 * "♡ Guardar" / "♥ Guardado": una acción del cliente (nunca automática).
 * - `icon`: solo el corazón (tarjetas); `text`: con la palabra (perfil).
 * - Sin sesión lleva a ingresar y vuelve a la misma pantalla.
 * - Estado visible sin depender del color (relleno + texto "Guardado"), sin rojo chillón.
 * - Etiqueta accesible real: "Guardar profesional" / "Quitar de guardados".
 * - No aparece en el propio perfil profesional.
 */
@Component({
  selector: 'app-save-professional',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex' },
  template: `
    @if (!own()) {
      <button
        type="button"
        class="save press inline-flex items-center justify-center gap-1.5 rounded-full text-[14px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand disabled:opacity-60"
        [class]="
          (variant() === 'icon' ? 'size-11 ' : 'min-h-11 px-3.5 border border-line ') +
          (saved() ? 'bg-brand-tint text-brand-dark' : 'bg-surface text-ink-soft hover:bg-sand-dark hover:text-ink')
        "
        [attr.aria-pressed]="saved()"
        [attr.aria-label]="(saved() ? 'Quitar de guardados' : 'Guardar profesional') + (name() ? ': ' + name() : '')"
        [disabled]="busy()"
        data-testid="save-professional"
        (click)="toggle($event)"
      >
        @for (s of stateKey(); track s) {
          <app-icon [name]="s ? 'heart-filled' : 'heart'" [size]="variant() === 'icon' ? 20 : 18" [stroke]="2" class="animate-pop" />
        }
        @if (variant() === 'text') {
          <span>{{ saved() ? 'Guardado' : 'Guardar' }}</span>
        }
      </button>
    }
  `,
})
export class SaveProfessional {
  private readonly auth = inject(AuthStore);
  private readonly store = inject(MyProfessionalsStore);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly route = inject(CurrentRoute);

  readonly professionalId = input.required<string>();
  /** Nombre del profesional (para la etiqueta accesible). */
  readonly name = input<string | null>(null);
  readonly variant = input<'icon' | 'text'>('icon');

  protected readonly saved = computed(() => this.store.isSaved(this.professionalId()));
  /** Se recrea el ícono al cambiar el estado (animación de guardado). */
  protected readonly stateKey = computed(() => [this.saved()]);
  protected readonly busy = computed(() => this.store.pending().has(this.professionalId()));
  protected readonly own = computed(() => this.auth.user()?.professionalProfileId === this.professionalId());

  constructor() {
    // Con sesión, una sola carga compartida de "Mis profesionales" para todos los corazones.
    effect(() => {
      if (this.auth.authenticated()) untracked(() => void this.store.load());
    });
  }

  protected async toggle(event: Event): Promise<void> {
    // Dentro de una tarjeta clickeable: guardar no abre el perfil.
    event.preventDefault();
    event.stopPropagation();
    if (!this.auth.authenticated()) {
      await this.router.navigate(['/ingresar'], { queryParams: { returnUrl: this.route.url() } });
      return;
    }
    const result = await this.store.toggle(this.professionalId());
    if (result === true) {
      this.toast.show('Guardado en Mis profesionales.', 2800, 'success', { label: 'Ver', link: ['/mis-profesionales'] });
    } else if (result === false) {
      this.toast.show('Quitado de guardados.');
    } else {
      this.toast.show('No pudimos guardar el cambio. Probá de nuevo.', 4000, 'info');
    }
  }
}
