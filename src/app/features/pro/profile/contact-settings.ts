import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ProStore } from '../../../core/state/pro.store';
import { Icon } from '../../../shared/components/icon/icon';
import { ContactChannelsForm, DEFAULT_CONTACT } from './contact-channels-form';

/**
 * "Cómo te contactan" (Mi perfil): resumen de los canales y edición con el formulario
 * único `ContactChannelsForm` (el mismo del alta). Las reglas viven ahí y en el backend.
 */
@Component({
  selector: 'app-contact-settings',
  imports: [Icon, ContactChannelsForm],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <section
      id="profile-contact"
      class="presence-section rounded-2xl border border-line bg-surface p-5 md:p-6"
      aria-labelledby="sec-contact"
      data-testid="contact-settings"
    >
      <div class="flex items-start gap-3">
        <div class="min-w-0 flex-1">
          <h2 id="sec-contact" class="text-[17px] leading-6 font-bold">Cómo te contactan</h2>
          <p class="text-[14px] text-muted">WhatsApp, llamadas o solicitudes por Resuelve</p>
        </div>
        @if (!editing()) {
          <button
            type="button"
            class="flex min-h-11 items-center gap-1.5 rounded-lg border border-line-btn px-3 text-[14px] font-semibold text-ink hover:bg-sand-light"
            aria-label="Editar formas de contacto"
            (click)="edit()"
          >
            <app-icon name="pencil" [size]="14" />Editar
          </button>
        }
      </div>

      @if (editing()) {
        <app-contact-channels-form
          class="mt-4"
          [initial]="current()"
          (saved)="editing.set(false)"
          (cancelled)="editing.set(false)"
        />
      } @else {
        <ul class="mt-3 flex flex-col gap-2 text-[15px]" data-testid="contact-summary">
          @if (current().whatsappEnabled) {
            <li class="flex items-center gap-2">
              <app-icon name="chat" [size]="16" class="text-brand" /><span class="font-semibold">WhatsApp</span>
              <span class="text-muted">{{ current().whatsappDisplay }}</span>
            </li>
          }
          @if (current().callsEnabled) {
            <li class="flex items-center gap-2">
              <app-icon name="phone" [size]="15" class="text-brand" /><span class="font-semibold">Llamadas</span>
              <span class="text-muted">{{ current().phoneDisplay }}</span>
            </li>
          }
          @if (current().requestsEnabled) {
            <li class="flex items-center gap-2">
              <app-icon name="document" [size]="16" class="text-brand" /><span class="font-semibold"
                >Solicitudes por Resuelve</span
              >
            </li>
          }
        </ul>
        @if (!current().whatsappEnabled && !current().callsEnabled) {
          <p class="mt-3 text-[14px] text-muted">
            Sumá WhatsApp o llamadas para que te contacten directo desde tu perfil, sin crear una cuenta.
          </p>
        }
      }
    </section>
  `,
})
export class ContactSettings {
  protected readonly store = inject(ProStore);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  protected readonly current = computed(() => this.store.ownProfile()?.contact ?? DEFAULT_CONTACT);
  protected readonly editing = signal(false);

  /** Abre la edición. Desde el aviso de Mi perfil (`reveal`) además lleva la sección a la vista. */
  edit(reveal = false): void {
    this.editing.set(true);
    if (!reveal) return;
    afterNextRender(
      () => {
        const section = this.host.nativeElement.querySelector<HTMLElement>('#profile-contact');
        section?.scrollIntoView({ block: 'start', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
        section?.querySelector<HTMLInputElement>('input[type=checkbox]')?.focus({ preventScroll: true });
      },
      { injector: this.injector },
    );
  }
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
