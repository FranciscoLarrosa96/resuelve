import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ContactSettingsInput, OwnContactSettings } from '../../../core/models/pro-profile';
import { CONTACT_MESSAGES, ProStore } from '../../../core/state/pro.store';
import { Icon, IconName } from '../../../shared/components/icon/icon';

/** Profesional nuevo: solo solicitudes por Resuelve, sin números ni consentimiento. */
export const DEFAULT_CONTACT: OwnContactSettings = {
  whatsappEnabled: false,
  callsEnabled: false,
  requestsEnabled: true,
  whatsappNumber: null,
  whatsappDisplay: null,
  phoneNumber: null,
  phoneDisplay: null,
  phoneKind: null,
  consentAt: null,
};

type Channel = 'whatsapp' | 'calls' | 'requests';

/**
 * Formulario único de canales de contacto (Mi perfil → "Cómo te contactan" y el paso
 * "¿Cómo querés recibir clientes?" del alta). WhatsApp, llamadas y solicitudes por
 * Resuelve, uno o varios. Los números son SOLO de contacto (nunca el teléfono de la
 * cuenta) y se muestran a otros usuarios solo con el consentimiento explícito de acá,
 * desmarcado salvo que ya lo haya dado para los mismos canales. Sacar WhatsApp y
 * llamadas retira el consentimiento y el backend borra los números. El backend
 * normaliza y valida (`PATCH /pro/contact` vía `ProStore.saveContact`); acá solo se
 * avisa lo obvio antes de enviar.
 */
@Component({
  selector: 'app-contact-channels-form',
  imports: [Icon, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  styles: `
    .channel-icon {
      display: inline-flex;
      flex-shrink: 0;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      border-radius: 10px;
      background: var(--color-sand-light);
      color: var(--color-brand);
    }
    .channel {
      transition:
        border-color 160ms ease,
        background-color 160ms ease;
    }
    .channel-extra {
      animation: channel-in 180ms ease-out;
    }
    @keyframes channel-in {
      from {
        opacity: 0;
        transform: translateY(-4px);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .channel {
        transition: none;
      }
      .channel-extra {
        animation: none;
      }
    }
  `,
  template: `
    <form class="flex flex-col gap-4" novalidate (submit)="$event.preventDefault(); save()">
      <fieldset class="flex flex-col gap-3">
        <legend class="text-[15px] font-semibold">{{ legend() }}</legend>
        <p class="-mt-1 text-[14px] text-muted">Podés elegir varias. Al menos una.</p>

        <!-- WhatsApp -->
        <div class="channel rounded-xl border p-3.5" [class]="cardClass(whatsapp())">
          <label class="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              class="mt-1 size-4.5 shrink-0 accent-brand"
              [checked]="whatsapp()"
              (change)="toggle('whatsapp', $any($event.target).checked)"
              data-testid="contact-whatsapp-toggle"
            />
            <span class="channel-icon" aria-hidden="true">
              <app-icon [name]="icons.whatsapp" [size]="18" />
            </span>
            <span class="min-w-0">
              <span class="block text-[15px] font-semibold">{{ texts().whatsapp.title }}</span>
              <span class="block text-[14px] text-muted">{{ texts().whatsapp.body }}</span>
            </span>
          </label>
          @if (whatsapp()) {
            <div class="channel-extra mt-3 sm:pl-[78px]">
              <label [for]="ids.whatsapp" class="block text-[14px] font-semibold">Número de WhatsApp</label>
              <input
                [id]="ids.whatsapp"
                type="tel"
                inputmode="tel"
                autocomplete="tel"
                maxlength="32"
                placeholder="Ej.: 249 15 412-3456"
                [value]="whatsappNumber()"
                (input)="whatsappNumber.set($any($event.target).value); clearError('whatsappNumber')"
                class="mt-1.5 h-12 w-full max-w-xs rounded-xl field-control px-3.5 text-[15px]"
                [attr.aria-describedby]="ids.whatsapp + '-help'"
                [attr.aria-invalid]="errorField() === 'whatsappNumber'"
              />
              <p [id]="ids.whatsapp + '-help'" class="mt-1 text-[13px]" [class]="helpClass('whatsappNumber')">
                {{ errorField() === 'whatsappNumber' ? error() : 'Con característica, como 11 2345-6789 o 249 15 412-3456. Si es de otro país, empezá con +.' }}
              </p>
            </div>
          }
        </div>

        <!-- Llamadas -->
        <div class="channel rounded-xl border p-3.5" [class]="cardClass(calls())">
          <label class="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              class="mt-1 size-4.5 shrink-0 accent-brand"
              [checked]="calls()"
              (change)="toggle('calls', $any($event.target).checked)"
              data-testid="contact-calls-toggle"
            />
            <span class="channel-icon" aria-hidden="true">
              <app-icon [name]="icons.calls" [size]="17" />
            </span>
            <span class="min-w-0">
              <span class="block text-[15px] font-semibold">{{ texts().calls.title }}</span>
              <span class="block text-[14px] text-muted">{{ texts().calls.body }}</span>
            </span>
          </label>
          @if (calls()) {
            <div class="channel-extra mt-3 sm:pl-[78px]">
              @if (whatsapp()) {
                <label class="flex min-h-11 cursor-pointer items-center gap-2 text-[14px] font-semibold">
                  <input
                    type="checkbox"
                    class="size-4.5 accent-brand"
                    [checked]="samePhone()"
                    (change)="samePhone.set($any($event.target).checked); clearError('phoneNumber')"
                    data-testid="contact-same-number"
                  />Uso el mismo número de WhatsApp
                </label>
              }
              @if (!usesWhatsappNumber()) {
                <label [for]="ids.phone" class="mt-1 block text-[14px] font-semibold">Teléfono para llamadas</label>
                <input
                  [id]="ids.phone"
                  type="tel"
                  inputmode="tel"
                  autocomplete="tel"
                  maxlength="32"
                  placeholder="Ej.: 249 442-3456"
                  [value]="phoneNumber()"
                  (input)="phoneNumber.set($any($event.target).value); clearError('phoneNumber')"
                  class="mt-1.5 h-12 w-full max-w-xs rounded-xl field-control px-3.5 text-[15px]"
                  [attr.aria-describedby]="ids.phone + '-help'"
                  [attr.aria-invalid]="errorField() === 'phoneNumber'"
                />
                <p [id]="ids.phone + '-help'" class="mt-1 text-[13px]" [class]="helpClass('phoneNumber')">
                  {{ errorField() === 'phoneNumber' ? error() : 'Celular o fijo, con característica.' }}
                </p>
                <div class="mt-1 flex gap-5 text-[14px]" role="radiogroup" aria-label="Tipo de teléfono">
                  <label class="flex min-h-11 cursor-pointer items-center gap-2">
                    <input
                      type="radio"
                      [name]="ids.phone + '-kind'"
                      class="size-4.5 accent-brand"
                      [checked]="phoneKind() === 'MOBILE'"
                      (change)="phoneKind.set('MOBILE')"
                    />Celular
                  </label>
                  <label class="flex min-h-11 cursor-pointer items-center gap-2">
                    <input
                      type="radio"
                      [name]="ids.phone + '-kind'"
                      class="size-4.5 accent-brand"
                      [checked]="phoneKind() === 'LANDLINE'"
                      (change)="phoneKind.set('LANDLINE')"
                    />Fijo
                  </label>
                </div>
              }
            </div>
          }
        </div>

        <!-- Solicitudes por Resuelve -->
        <div class="channel rounded-xl border p-3.5" [class]="cardClass(requests())">
          <label class="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              class="mt-1 size-4.5 shrink-0 accent-brand"
              [checked]="requests()"
              (change)="toggle('requests', $any($event.target).checked)"
              data-testid="contact-requests-toggle"
            />
            <span class="channel-icon" aria-hidden="true">
              <app-icon [name]="icons.requests" [size]="17" />
            </span>
            <span class="min-w-0">
              <span class="block text-[15px] font-semibold">{{ texts().requests.title }}</span>
              <span class="block text-[14px] text-muted">
                {{ texts().requests.body }}
                @if (!requests() && initial().requestsEnabled) {
                  Lo que ya recibiste y tus trabajos en curso siguen igual.
                }
              </span>
            </span>
          </label>
        </div>
      </fieldset>

      @if (direct()) {
        <div class="channel-extra rounded-xl bg-sand-light p-3.5" data-testid="contact-consent">
          <label class="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              class="mt-0.5 size-4.5 shrink-0 accent-brand"
              [checked]="consent()"
              (change)="consent.set($any($event.target).checked); clearError(null)"
              [attr.aria-describedby]="ids.consent"
            />
            <span class="text-[14px] leading-[1.5] font-semibold text-ink">
              Autorizo a Resuelve a mostrar mi número de contacto a las personas que quieran comunicarse
              conmigo por los canales que elegí.
            </span>
          </label>
          <ul [id]="ids.consent" class="mt-2 flex list-disc flex-col gap-0.5 pl-12 text-[13.5px] leading-[1.5] text-muted">
            <li>Lo obtiene quien toca WhatsApp o Llamar en tu perfil, y puede guardarlo.</li>
            <li>Sirve para que te contacten posibles clientes. Es aparte del teléfono de tu cuenta.</li>
            <li>
              Podés apagar estos canales y retirar el consentimiento cuando quieras desde Mi perfil.
              <a routerLink="/privacidad" fragment="contacto" target="_blank" class="font-semibold text-brand underline"
                >Política de Privacidad</a
              >
            </li>
          </ul>
        </div>
      }

      @if (error() && !fieldError()) {
        <p class="text-[14px] font-medium text-danger" role="alert">{{ error() }}</p>
      }
      @if (fieldError()) {
        <p class="sr-only" role="alert">{{ error() }}</p>
      }
      <div class="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <button
          type="submit"
          class="button-primary flex h-12 items-center justify-center gap-2 rounded-xl px-5 text-[15px] font-bold disabled:opacity-60"
          [disabled]="store.savingContact()"
          [attr.aria-busy]="store.savingContact()"
        >
          {{ store.savingContact() ? 'Guardando…' : submitLabel() }}
        </button>
        <button
          type="button"
          class="h-12 rounded-xl px-4 text-[15px] font-semibold text-ink-soft hover:bg-sand disabled:opacity-55"
          [disabled]="store.savingContact()"
          (click)="cancelled.emit()"
        >
          {{ cancelLabel() }}
        </button>
      </div>
    </form>
  `,
})
export class ContactChannelsForm implements OnInit {
  protected readonly store = inject(ProStore);

  /** Configuración guardada de la que parte (para un perfil nuevo, `DEFAULT_CONTACT`). */
  readonly initial = input<OwnContactSettings>(DEFAULT_CONTACT);
  readonly legend = input('¿Cómo querés que te contacten?');
  readonly submitLabel = input('Guardar');
  readonly cancelLabel = input('Cancelar');
  /** Textos de las opciones: cortos en Mi perfil, explicativos en el alta. */
  readonly variant = input<'compact' | 'intro'>('compact');
  /** Prefijo de los ids (dos formularios en la misma página no chocan). */
  readonly idPrefix = input('cs');
  /** Guardado: lo que se mandó (el backend ya lo aceptó). */
  readonly saved = output<ContactSettingsInput>();
  readonly cancelled = output<void>();

  protected readonly icons: Record<Channel, IconName> = { whatsapp: 'chat', calls: 'phone', requests: 'document' };
  protected ids = { whatsapp: 'cs-whatsapp', phone: 'cs-phone', consent: 'cs-consent' };
  protected readonly texts = computed(() => (this.variant() === 'intro' ? INTRO_TEXTS : COMPACT_TEXTS));

  protected readonly whatsapp = signal(false);
  protected readonly calls = signal(false);
  protected readonly requests = signal(true);
  protected readonly whatsappNumber = signal('');
  protected readonly phoneNumber = signal('');
  protected readonly phoneKind = signal<'MOBILE' | 'LANDLINE'>('MOBILE');
  protected readonly samePhone = signal(true);
  protected readonly consent = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly errorField = signal<string | null>(null);
  protected readonly direct = computed(() => this.whatsapp() || this.calls());
  protected readonly usesWhatsappNumber = computed(() => this.whatsapp() && this.samePhone());
  /** El error se muestra debajo del campo (con un aviso para lectores de pantalla). */
  protected readonly fieldError = computed(() => {
    const field = this.errorField();
    return field === 'whatsappNumber' || (field === 'phoneNumber' && !this.usesWhatsappNumber());
  });

  ngOnInit(): void {
    const prefix = this.idPrefix();
    this.ids = { whatsapp: `${prefix}-whatsapp`, phone: `${prefix}-phone`, consent: `${prefix}-consent` };
    const c = this.initial();
    this.whatsapp.set(c.whatsappEnabled);
    this.calls.set(c.callsEnabled);
    this.requests.set(c.requestsEnabled);
    this.whatsappNumber.set(c.whatsappDisplay ?? '');
    this.phoneNumber.set(c.phoneDisplay ?? '');
    this.phoneKind.set(c.phoneKind ?? 'MOBILE');
    this.samePhone.set(!c.callsEnabled || !c.whatsappEnabled || c.phoneNumber === c.whatsappNumber);
    // El consentimiento guardado vale para los canales que ya tenía; nunca se marca solo.
    this.consent.set(!!c.consentAt && (c.whatsappEnabled || c.callsEnabled));
  }

  protected cardClass(selected: boolean): string {
    return selected ? 'border-brand bg-brand-tint' : 'border-line bg-surface';
  }

  protected helpClass(field: string): string {
    return this.errorField() === field ? 'font-medium text-danger' : 'text-muted';
  }

  protected toggle(channel: Channel, on: boolean): void {
    if (channel === 'whatsapp') this.whatsapp.set(on);
    else if (channel === 'calls') this.calls.set(on);
    else this.requests.set(on);
    // Un canal directo nuevo publica un número más: se vuelve a pedir el consentimiento.
    const initial = this.initial();
    if (on && ((channel === 'whatsapp' && !initial.whatsappEnabled) || (channel === 'calls' && !initial.callsEnabled))) {
      this.consent.set(false);
    }
    this.clearError(null);
  }

  protected clearError(field: string | null): void {
    if (field === null || this.errorField() === field) {
      this.error.set(null);
      this.errorField.set(null);
    }
  }

  protected async save(): Promise<void> {
    if (this.store.savingContact()) return;
    this.error.set(null);
    this.errorField.set(null);
    const problem = this.problem();
    if (problem) return this.fail(problem);
    const direct = this.direct();
    const body: ContactSettingsInput = {
      whatsappEnabled: this.whatsapp(),
      callsEnabled: this.calls(),
      requestsEnabled: this.requests(),
      // Sin canales directos se retira el consentimiento y el backend borra los números.
      consent: direct && this.consent(),
      ...(direct
        ? {
            whatsappNumber: this.whatsapp() ? this.whatsappNumber() : null,
            phoneNumber: this.calls() ? (this.usesWhatsappNumber() ? this.whatsappNumber() : this.phoneNumber()) : null,
            phoneKind: this.usesWhatsappNumber() ? 'MOBILE' : this.phoneKind(),
          }
        : {}),
    };
    const result = await this.store.saveContact(body);
    if (!result) {
      this.saved.emit(body);
      return;
    }
    // Con "el mismo número", un error en el teléfono es un error en el de WhatsApp.
    this.fail({ ...result, field: result.field === 'phoneNumber' && this.usesWhatsappNumber() ? 'whatsappNumber' : result.field });
  }

  private fail(problem: { message: string; field: string | null }): void {
    this.error.set(problem.message);
    this.errorField.set(problem.field);
  }

  private problem(): { message: string; field: string | null } | null {
    if (!this.whatsapp() && !this.calls() && !this.requests()) return { message: CONTACT_MESSAGES.channel, field: null };
    if (this.whatsapp() && !this.whatsappNumber().trim()) return { message: 'Falta tu número de WhatsApp.', field: 'whatsappNumber' };
    if (this.calls() && !this.usesWhatsappNumber() && !this.phoneNumber().trim())
      return { message: 'Falta el teléfono para llamadas.', field: 'phoneNumber' };
    if (this.direct() && !this.consent()) return { message: CONTACT_MESSAGES.consent, field: null };
    return null;
  }
}

const COMPACT_TEXTS = {
  whatsapp: { title: 'WhatsApp', body: 'Te escriben con un saludo de Resuelve.' },
  calls: { title: 'Llamadas telefónicas', body: 'Te llaman desde el celular.' },
  requests: { title: 'Solicitudes por Resuelve', body: 'Te piden presupuesto y respondés desde Resuelve, con las reglas de tu plan.' },
} as const;

const INTRO_TEXTS = {
  whatsapp: {
    title: 'Recibí consultas por WhatsApp',
    body: 'Los clientes podrán escribirte directamente para consultar por tus servicios.',
  },
  calls: { title: 'Recibí llamadas de clientes', body: 'Permití que las personas te llamen directamente desde tu perfil.' },
  requests: {
    title: 'Recibí solicitudes y presupuestos',
    body: 'Los clientes podrán enviarte solicitudes para que prepares presupuestos desde Resuelve.',
  },
} as const;
