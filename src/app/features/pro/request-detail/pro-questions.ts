import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { classifyError } from '../../../core/api/api-error';
import { ProToolsApiService } from '../../../core/api/pro-tools-api.service';
import { ProQuestions, QUESTION_MAX_LENGTH } from '../../../core/models/pro-tools';
import { contactInText } from '../../../core/utils/contact-in-text';
import { formatTimestamp } from '../../../core/utils/dates';
import { Icon } from '../../../shared/components/icon/icon';

/**
 * "¿Necesitás saber algo antes de presupuestar?": el profesional invitado le
 * hace una consulta al cliente (una a la vez, pocas) y ve la respuesta. Las
 * reglas las decide el backend (`canAsk`); acá solo se muestran.
 */
@Component({
  selector: 'app-pro-questions',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (data(); as d) {
      @if (d.items.length || d.canAsk) {
        <section id="consultas" class="scroll-mt-24" aria-labelledby="questions-title" data-testid="pro-questions">
          <h2 id="questions-title" class="flex items-center gap-2 text-[15px] font-bold">
            <app-icon name="chat" [size]="16" class="text-brand" />Consultas al cliente
          </h2>
          @if (!d.items.length) {
            <p class="mt-1 text-[14px] leading-snug text-muted">
              ¿Te falta un dato para presupuestar bien? Preguntale antes de enviar tu propuesta.
            </p>
          }
          @if (d.items.length) {
            <ul class="mt-3 flex flex-col gap-3">
              @for (q of d.items; track q.id) {
                <li class="rounded-xl border border-line-soft bg-surface p-3.5">
                  <p class="text-[13px] font-semibold text-muted">Vos · {{ when(q.askedAt) }}</p>
                  <p class="mt-0.5 text-[15px] leading-snug break-words whitespace-pre-line text-ink">{{ q.question }}</p>
                  @if (q.answer) {
                    <div class="mt-2.5 border-l-2 border-brand-line pl-3">
                      <p class="text-[13px] font-semibold text-brand-dark">Respuesta del cliente · {{ when(q.answeredAt!) }}</p>
                      <p class="mt-0.5 text-[15px] leading-snug break-words whitespace-pre-line text-ink">{{ q.answer }}</p>
                    </div>
                  } @else {
                    <p class="mt-2 inline-flex items-center gap-1.5 text-[13.5px] text-muted">
                      <app-icon name="clock" [size]="13" />Esperando respuesta. Te avisamos cuando conteste.
                    </p>
                  }
                </li>
              }
            </ul>
          }
          @if (d.canAsk) {
            @if (open()) {
              <form class="mt-3" novalidate (submit)="$event.preventDefault(); send()">
                <label for="question-text" class="text-[14px] font-semibold">Tu consulta</label>
                <textarea
                  id="question-text"
                  rows="3"
                  [attr.maxlength]="max"
                  placeholder="Ej: ¿Me podés contar de qué material es la cañería?"
                  class="mt-1.5 w-full rounded-xl field-control px-3.5 py-3 text-[15px]"
                  aria-describedby="question-help"
                  [attr.aria-invalid]="!!error()"
                  [value]="draft()"
                  (input)="draft.set($any($event.target).value)"
                ></textarea>
                <p id="question-help" class="mt-1 flex justify-between gap-3 text-[13px] text-muted">
                  <span>Sin teléfonos ni emails: el contacto se comparte si te eligen.</span>
                  <span class="tabular-nums">{{ draft().length }}/{{ max }}</span>
                </p>
                @if (error(); as e) {
                  <p class="mt-1.5 text-[14px] font-medium text-danger" role="alert">{{ e }}</p>
                }
                <div class="mt-3 flex flex-wrap gap-2">
                  <button type="submit" class="button-primary min-h-11 rounded-xl px-4 text-[14.5px] font-semibold disabled:opacity-60" [disabled]="busy()">
                    {{ busy() ? 'Enviando…' : 'Enviar consulta' }}
                  </button>
                  <button type="button" class="min-h-11 rounded-xl px-4 text-[14.5px] font-semibold text-ink-soft hover:bg-sand" [disabled]="busy()" (click)="open.set(false)">
                    Cancelar
                  </button>
                </div>
              </form>
            } @else {
              <button
                type="button"
                class="button-secondary mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-xl px-4 text-[14.5px] font-semibold"
                (click)="open.set(true)"
              >
                <app-icon name="chat" [size]="15" />{{ d.items.length ? 'Hacer otra consulta' : 'Hacer una consulta' }}
              </button>
              @if (remaining() !== null) {
                <p class="mt-1.5 text-[13px] text-muted">Podés hacer {{ remaining() }} {{ remaining() === 1 ? 'consulta más' : 'consultas más' }} en esta solicitud.</p>
              }
            }
          }
          @if (status(); as s) {
            <p class="sr-only" role="status">{{ s }}</p>
          }
        </section>
      }
    }
  `,
})
export class ProQuestionsPanel {
  readonly requestId = input.required<string>();
  private readonly api = inject(ProToolsApiService);
  protected readonly max = QUESTION_MAX_LENGTH;
  protected readonly data = signal<ProQuestions | null>(null);
  protected readonly open = signal(false);
  protected readonly draft = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly status = signal<string | null>(null);
  protected readonly remaining = computed(() => {
    const d = this.data();
    return d && d.items.length ? d.max - d.items.length : null;
  });

  constructor() {
    effect(() => {
      const id = this.requestId();
      untracked(() => void this.load(id));
    });
  }

  protected when(iso: string): string {
    return formatTimestamp(iso);
  }

  private async load(id: string): Promise<void> {
    try {
      this.data.set(await firstValueFrom(this.api.proQuestions(id)));
    } catch {
      this.data.set(null);
    }
  }

  protected async send(): Promise<void> {
    const text = this.draft().trim();
    const contact = text ? contactInText(text) : null;
    if (!text) return this.error.set('Escribí tu consulta.');
    if (contact) return this.error.set(`No incluyas ${contact === 'EMAIL' ? 'emails' : 'teléfonos'}: el contacto se comparte si te eligen.`);
    this.busy.set(true);
    this.error.set(null);
    try {
      this.data.set(await firstValueFrom(this.api.ask(this.requestId(), text)));
      this.draft.set('');
      this.open.set(false);
      this.status.set('Consulta enviada. Te avisamos cuando el cliente responda.');
    } catch (e) {
      const err = classifyError(e);
      this.error.set(
        err.code === 'QUESTION_PENDING'
          ? 'Esperá la respuesta del cliente antes de hacer otra consulta.'
          : err.code === 'QUESTIONS_LIMIT_REACHED'
            ? 'Ya hiciste todas las consultas posibles en esta solicitud.'
            : err.code === 'QUESTION_NOT_ALLOWED'
              ? 'Esta solicitud ya no admite consultas.'
              : err.code === 'INVALID_QUESTION'
                ? 'Revisá la consulta: sin teléfonos ni emails, hasta 500 caracteres.'
                : 'No pudimos enviar la consulta. Probá de nuevo.',
      );
    } finally {
      this.busy.set(false);
    }
  }
}
