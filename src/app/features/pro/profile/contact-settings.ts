import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { OwnContactSettings } from '../../../core/models/pro-profile';
import { CONTACT_MESSAGES, ProStore } from '../../../core/state/pro.store';
import { Icon } from '../../../shared/components/icon/icon';

const EMPTY: OwnContactSettings = {
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

/**
 * "¿Cómo querés que te contacten?" (Mi perfil): WhatsApp, llamadas y solicitudes por
 * Resuelve, uno o varios. Los números son SOLO de contacto (nunca el teléfono de la
 * cuenta) y se muestran a otros usuarios solo con el consentimiento explícito de acá.
 * Sacar WhatsApp y llamadas retira el consentimiento y borra los números. El backend
 * normaliza y valida (`PATCH /pro/contact`); acá solo se avisa lo obvio antes de enviar.
 */
@Component({
  selector: 'app-contact-settings',
  imports: [Icon],
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
        <form class="mt-4 flex flex-col gap-4" novalidate (submit)="$event.preventDefault(); save()">
          <fieldset class="flex flex-col gap-3">
            <legend class="text-[15px] font-semibold">¿Cómo querés que te contacten?</legend>
            <p class="-mt-1 text-[14px] text-muted">Podés elegir varias. Al menos una.</p>

            <div class="rounded-xl border border-line p-3.5">
              <label class="flex items-start gap-3">
                <input
                  type="checkbox"
                  class="mt-0.5 size-4.5 accent-brand"
                  [checked]="whatsapp()"
                  (change)="whatsapp.set($any($event.target).checked)"
                  data-testid="contact-whatsapp-toggle"
                />
                <span>
                  <span class="block text-[15px] font-semibold">WhatsApp</span>
                  <span class="block text-[14px] text-muted">Te escriben con un saludo de Resuelve.</span>
                </span>
              </label>
              @if (whatsapp()) {
                <div class="mt-3 pl-7.5">
                  <label for="cs-whatsapp" class="block text-[14px] font-semibold">Número de WhatsApp</label>
                  <input
                    id="cs-whatsapp"
                    type="tel"
                    inputmode="tel"
                    autocomplete="tel"
                    maxlength="32"
                    placeholder="249 15 412-3456"
                    [value]="whatsappNumber()"
                    (input)="whatsappNumber.set($any($event.target).value)"
                    class="mt-1.5 h-12 w-full max-w-xs rounded-xl field-control px-3.5 text-[15px]"
                    aria-describedby="cs-whatsapp-help"
                    [attr.aria-invalid]="errorField() === 'whatsappNumber'"
                  />
                  <p id="cs-whatsapp-help" class="mt-1 text-[13px] text-muted">
                    Con característica. Si es de otro país, empezá con +.
                  </p>
                </div>
              }
            </div>

            <div class="rounded-xl border border-line p-3.5">
              <label class="flex items-start gap-3">
                <input
                  type="checkbox"
                  class="mt-0.5 size-4.5 accent-brand"
                  [checked]="calls()"
                  (change)="calls.set($any($event.target).checked)"
                  data-testid="contact-calls-toggle"
                />
                <span>
                  <span class="block text-[15px] font-semibold">Llamadas telefónicas</span>
                  <span class="block text-[14px] text-muted">Te llaman desde el celular.</span>
                </span>
              </label>
              @if (calls()) {
                <div class="mt-3 pl-7.5">
                  <label for="cs-phone" class="block text-[14px] font-semibold">Teléfono para llamadas</label>
                  <div class="mt-1.5 flex flex-wrap items-center gap-2">
                    <input
                      id="cs-phone"
                      type="tel"
                      inputmode="tel"
                      autocomplete="tel"
                      maxlength="32"
                      placeholder="249 442-3456"
                      [value]="phoneNumber()"
                      (input)="phoneNumber.set($any($event.target).value)"
                      class="h-12 w-full max-w-xs rounded-xl field-control px-3.5 text-[15px]"
                      [attr.aria-invalid]="errorField() === 'phoneNumber'"
                    />
                    @if (whatsapp() && whatsappNumber().trim()) {
                      <button
                        type="button"
                        class="min-h-11 text-[14px] font-semibold text-brand hover:underline"
                        (click)="sameAsWhatsapp()"
                      >
                        Usar el de WhatsApp
                      </button>
                    }
                  </div>
                  <div class="mt-2 flex gap-5 text-[14px]" role="radiogroup" aria-label="Tipo de teléfono">
                    <label class="flex min-h-11 items-center gap-2">
                      <input
                        type="radio"
                        name="cs-phone-kind"
                        class="size-4.5 accent-brand"
                        [checked]="phoneKind() === 'MOBILE'"
                        (change)="phoneKind.set('MOBILE')"
                      />Celular
                    </label>
                    <label class="flex min-h-11 items-center gap-2">
                      <input
                        type="radio"
                        name="cs-phone-kind"
                        class="size-4.5 accent-brand"
                        [checked]="phoneKind() === 'LANDLINE'"
                        (change)="phoneKind.set('LANDLINE')"
                      />Fijo
                    </label>
                  </div>
                </div>
              }
            </div>

            <div class="rounded-xl border border-line p-3.5">
              <label class="flex items-start gap-3">
                <input
                  type="checkbox"
                  class="mt-0.5 size-4.5 accent-brand"
                  [checked]="requests()"
                  (change)="requests.set($any($event.target).checked)"
                  data-testid="contact-requests-toggle"
                />
                <span>
                  <span class="block text-[15px] font-semibold">Solicitudes por Resuelve</span>
                  <span class="block text-[14px] text-muted">
                    Te piden presupuesto y respondés desde Resuelve, con las reglas de tu plan.
                    @if (!requests()) {
                      Lo que ya recibiste y tus trabajos en curso siguen igual.
                    }
                  </span>
                </span>
              </label>
            </div>
          </fieldset>

          @if (direct()) {
            <label class="flex items-start gap-3 rounded-xl bg-sand-light p-3.5" data-testid="contact-consent">
              <input
                type="checkbox"
                class="mt-0.5 size-4.5 accent-brand"
                [checked]="consent()"
                (change)="consent.set($any($event.target).checked)"
              />
              <span class="text-[14px] leading-[1.5]">
                <span class="block font-semibold text-ink">
                  Acepto que mi número se muestre a quienes vean mi perfil para que me contacten.
                </span>
                <span class="mt-1 block text-muted">
                  Es un número de contacto aparte del de tu cuenta. Podés sacarlo cuando quieras, pero
                  quien ya lo vio puede haberlo guardado.
                </span>
              </span>
            </label>
          }

          @if (error(); as err) {
            <p class="text-[14px] font-medium text-danger" role="alert">{{ err }}</p>
          }
          <div class="flex flex-wrap gap-2">
            <button
              type="submit"
              class="button-primary flex h-12 items-center gap-2 rounded-xl px-5 text-[15px] font-bold disabled:opacity-60"
              [disabled]="store.savingContact()"
              [attr.aria-busy]="store.savingContact()"
            >
              {{ store.savingContact() ? 'Guardando…' : 'Guardar' }}
            </button>
            <button
              type="button"
              class="h-12 rounded-xl px-4 text-[15px] font-semibold text-ink-soft hover:bg-sand disabled:opacity-55"
              [disabled]="store.savingContact()"
              (click)="editing.set(false)"
            >
              Cancelar
            </button>
          </div>
        </form>
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
              <app-icon name="inbox" [size]="16" class="text-brand" /><span class="font-semibold"
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
  protected readonly current = computed(() => this.store.ownProfile()?.contact ?? EMPTY);

  protected readonly editing = signal(false);
  protected readonly whatsapp = signal(false);
  protected readonly calls = signal(false);
  protected readonly requests = signal(true);
  protected readonly whatsappNumber = signal('');
  protected readonly phoneNumber = signal('');
  protected readonly phoneKind = signal<'MOBILE' | 'LANDLINE'>('MOBILE');
  protected readonly consent = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly errorField = signal<string | null>(null);
  protected readonly direct = computed(() => this.whatsapp() || this.calls());

  protected edit(): void {
    const c = this.current();
    this.whatsapp.set(c.whatsappEnabled);
    this.calls.set(c.callsEnabled);
    this.requests.set(c.requestsEnabled);
    this.whatsappNumber.set(c.whatsappDisplay ?? '');
    this.phoneNumber.set(c.phoneDisplay ?? '');
    this.phoneKind.set(c.phoneKind ?? 'MOBILE');
    this.consent.set(!!c.consentAt);
    this.error.set(null);
    this.errorField.set(null);
    this.editing.set(true);
  }

  protected sameAsWhatsapp(): void {
    this.phoneNumber.set(this.whatsappNumber());
    this.phoneKind.set('MOBILE');
  }

  protected async save(): Promise<void> {
    this.error.set(null);
    this.errorField.set(null);
    const problem = this.problem();
    if (problem) {
      this.error.set(problem.message);
      this.errorField.set(problem.field);
      return;
    }
    const direct = this.direct();
    const result = await this.store.saveContact({
      whatsappEnabled: this.whatsapp(),
      callsEnabled: this.calls(),
      requestsEnabled: this.requests(),
      // Sin canales directos se retira el consentimiento y el backend borra los números.
      consent: direct && this.consent(),
      ...(direct
        ? {
            whatsappNumber: this.whatsapp() ? this.whatsappNumber() : null,
            phoneNumber: this.calls() ? this.phoneNumber() : null,
            phoneKind: this.phoneKind(),
          }
        : {}),
    });
    if (!result) {
      this.editing.set(false);
      return;
    }
    this.error.set(result.message);
    this.errorField.set(result.field);
  }

  private problem(): { message: string; field: string | null } | null {
    if (!this.whatsapp() && !this.calls() && !this.requests()) return { message: CONTACT_MESSAGES.channel, field: null };
    if (this.whatsapp() && !this.whatsappNumber().trim()) return { message: 'Falta tu número de WhatsApp.', field: 'whatsappNumber' };
    if (this.calls() && !this.phoneNumber().trim()) return { message: 'Falta el teléfono para llamadas.', field: 'phoneNumber' };
    if (this.direct() && !this.consent()) return { message: CONTACT_MESSAGES.consent, field: null };
    return null;
  }
}
