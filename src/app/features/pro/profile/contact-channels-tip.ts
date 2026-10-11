import { ChangeDetectionStrategy, Component, PLATFORM_ID, computed, inject, output, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ProStore } from '../../../core/state/pro.store';
import { Icon } from '../../../shared/components/icon/icon';

const KEY = 'resuelve:contact-tip-dismissed:';

/**
 * Aviso discreto en Mi perfil para quien todavía no sumó WhatsApp ni llamadas (sobre todo
 * profesionales de antes del contacto directo). No cambia nada solo: "Configurar" abre
 * "Cómo te contactan". Descartarlo se recuerda en este navegador; con un canal directo
 * ya no aparece.
 */
@Component({
  selector: 'app-contact-channels-tip',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block empty:hidden' },
  template: `
    @if (visible()) {
      <aside
        class="flex items-start gap-3 rounded-2xl border border-line bg-surface p-4 md:items-center md:px-5"
        aria-label="Contacto directo"
        data-testid="contact-tip"
      >
        <span
          class="inline-flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-brand-tint text-brand"
          aria-hidden="true"
        >
          <app-icon name="chat" [size]="18" />
        </span>
        <div class="min-w-0 flex-1 md:flex md:items-center md:gap-4">
          <p class="text-[14.5px] leading-[1.45] text-ink md:flex-1">
            Ahora podés recibir clientes directamente por WhatsApp o llamadas. Configurá cómo preferís que
            te contacten.
          </p>
          <button
            type="button"
            class="mt-2 min-h-11 shrink-0 rounded-xl button-secondary px-4 text-[14.5px] font-bold text-ink press md:mt-0"
            (click)="configure.emit()"
          >
            Configurar
          </button>
        </div>
        <button
          type="button"
          class="-mt-1 -mr-1 inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-sand-light hover:text-ink md:mt-0"
          aria-label="Descartar el aviso de contacto directo"
          (click)="dismiss()"
        >
          <app-icon name="close" [size]="16" />
        </button>
      </aside>
    }
  `,
})
export class ContactChannelsTip {
  private readonly store = inject(ProStore);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  readonly configure = output<void>();

  private readonly dismissedNow = signal(false);
  protected readonly visible = computed(() => {
    const profile = this.store.ownProfile();
    if (!this.isBrowser || !profile?.contact || this.dismissedNow()) return false;
    if (profile.contact.whatsappEnabled || profile.contact.callsEnabled) return false;
    return !readDismissed(profile.id);
  });

  protected dismiss(): void {
    const id = this.store.ownProfile()?.id;
    this.dismissedNow.set(true);
    if (!id) return;
    try {
      localStorage.setItem(KEY + id, '1');
    } catch {
      /* almacenamiento no disponible: se oculta solo en esta visita */
    }
  }
}

function readDismissed(profileId: string): boolean {
  try {
    return localStorage.getItem(KEY + profileId) === '1';
  } catch {
    return false;
  }
}
