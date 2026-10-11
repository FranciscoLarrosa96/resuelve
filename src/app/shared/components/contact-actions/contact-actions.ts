import {
  ChangeDetectionStrategy,
  Component,
  afterNextRender,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { classifyError } from '../../../core/api/api-error';
import { ContactChannel, ContactReveal, ProfessionalSummary, contactChannelsOf } from '../../../core/models/professional';
import { DirectContact } from '../../../core/state/direct-contact';
import { Icon } from '../icon/icon';

type ContactSubject = Pick<ProfessionalSummary, 'id' | 'displayName' | 'contactChannels' | 'acceptingRequests'>;

/**
 * "WhatsApp" y "Llamar": las acciones de contacto directo de un profesional, solo las que
 * él habilitó (nunca un botón deshabilitado). Mismo componente en resultados, urgencias y
 * perfil. No pide cuenta ni crea una solicitud: abre WhatsApp con un saludo o marca el
 * número (en la computadora muestra el número para copiarlo). Sin canales directos no
 * renderiza nada.
 */
@Component({
  selector: 'app-contact-actions',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  styles: `
    .contact-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .contact-row.stretch > button,
    .contact-row.stretch > .contact-number {
      flex: 1 1 0;
    }
  `,
  template: `
    @if (whatsapp() || phone()) {
      <div class="contact-row" [class.stretch]="stretch()" data-testid="contact-actions">
        @if (whatsapp()) {
          <button
            type="button"
            class="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold whitespace-nowrap press disabled:cursor-wait"
            [class]="primary() ? 'button-primary' : 'button-secondary text-ink'"
            [attr.aria-label]="'Escribirle por WhatsApp a ' + professional().displayName"
            [disabled]="busy() === 'WHATSAPP'"
            [attr.aria-busy]="busy() === 'WHATSAPP'"
            data-testid="contact-whatsapp"
            (click)="openWhatsapp()"
          >
            <app-icon name="chat" [size]="17" />WhatsApp
          </button>
        }
        @if (phone()) {
          @if (shownNumber(); as n) {
            <span
              class="contact-number inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand-tint px-3 text-sm font-semibold text-brand-dark"
              data-testid="contact-phone-number"
            >
              <a [href]="n.href" class="underline-offset-2 hover:underline">{{ n.display }}</a>
              <button
                type="button"
                class="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-[13px] font-semibold text-brand hover:underline"
                [attr.aria-label]="'Copiar el teléfono de ' + professional().displayName"
                (click)="copy(n.number)"
              >
                <app-icon [name]="copied() ? 'check' : 'copy'" [size]="14" />{{ copied() ? 'Copiado' : 'Copiar' }}
              </button>
            </span>
          } @else {
            <button
              type="button"
              class="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold whitespace-nowrap press disabled:cursor-wait"
              [class]="primary() && !whatsapp() ? 'button-primary' : 'button-secondary text-ink'"
              [attr.aria-label]="(dial() ? 'Llamar a ' : 'Ver el teléfono de ') + professional().displayName"
              [disabled]="busy() === 'PHONE'"
              [attr.aria-busy]="busy() === 'PHONE'"
              data-testid="contact-phone"
              (click)="call()"
            >
              <app-icon name="phone" [size]="16" />{{ dial() ? 'Llamar' : 'Ver teléfono' }}
            </button>
          }
        }
      </div>
      <p role="status" class="text-[13px] text-danger empty:hidden" [class.mt-1.5]="!!error()">{{ error() }}</p>
    }
  `,
})
export class ContactActions {
  private readonly contact = inject(DirectContact);

  readonly professional = input.required<ContactSubject>();
  /** El primer botón va relleno (cuando el contacto directo es la acción principal). */
  readonly primary = input(false);
  /** Botones del mismo ancho, ocupando la fila (barra fija del celular, tarjetas de urgencias). */
  readonly stretch = input(false);

  protected readonly whatsapp = computed(() => contactChannelsOf(this.professional()).whatsapp);
  protected readonly phone = computed(() => contactChannelsOf(this.professional()).phone);
  protected readonly busy = signal<ContactChannel | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly shownNumber = signal<ContactReveal | null>(null);
  protected readonly copied = signal(false);
  /** Hasta saber el dispositivo (después de hidratar) se ofrece "Llamar". */
  protected readonly dial = signal(true);

  constructor() {
    afterNextRender(() => this.dial.set(this.contact.canDial()));
  }

  /**
   * La pestaña se abre en el mismo toque (si se abre después de esperar la respuesta,
   * el navegador la bloquea como ventana emergente) y después se le da la dirección.
   */
  protected async openWhatsapp(): Promise<void> {
    const id = this.professional().id;
    this.error.set(null);
    const cached = this.contact.cached(id, 'WHATSAPP');
    if (cached) {
      window.open(cached.href, '_blank', 'noopener,noreferrer');
      return;
    }
    const win = window.open('', '_blank');
    this.busy.set('WHATSAPP');
    try {
      const { href } = await this.contact.reveal(id, 'WHATSAPP');
      if (win) {
        win.opener = null;
        win.location.href = href;
      } else {
        window.location.href = href;
      }
    } catch (e) {
      win?.close();
      this.error.set(this.message(e, 'WhatsApp'));
    } finally {
      this.busy.set(null);
    }
  }

  protected async call(): Promise<void> {
    this.error.set(null);
    this.busy.set('PHONE');
    try {
      const contact = await this.contact.reveal(this.professional().id, 'PHONE');
      if (this.dial()) window.location.href = contact.href;
      else this.shownNumber.set(contact);
    } catch (e) {
      this.error.set(this.message(e, 'el teléfono'));
    } finally {
      this.busy.set(null);
    }
  }

  protected async copy(number: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(number);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch {
      this.error.set('No pudimos copiarlo: seleccioná el número.');
    }
  }

  private message(e: unknown, what: string): string {
    const { kind } = classifyError(e);
    if (kind === 'not-found') return 'Este contacto ya no está disponible.';
    if (kind === 'rate-limited') return 'Hiciste muchos intentos seguidos. Probá en un minuto.';
    return `No pudimos abrir ${what}. Probá de nuevo.`;
  }
}
