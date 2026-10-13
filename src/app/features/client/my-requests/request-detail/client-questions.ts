import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { classifyError } from '../../../../core/api/api-error';
import { ProToolsApiService } from '../../../../core/api/pro-tools-api.service';
import { ClientQuestions, QUESTION_MAX_LENGTH, RequestQuestion } from '../../../../core/models/pro-tools';
import { contactInText } from '../../../../core/utils/contact-in-text';
import { Icon } from '../../../../shared/components/icon/icon';

/**
 * Consultas que le hicieron los profesionales invitados antes de presupuestar.
 * El cliente responde cada una una vez; nada de teléfonos ni emails (el
 * contacto se comparte al elegir un presupuesto). Sin consultas, no se muestra.
 */
@Component({
  selector: 'app-client-questions',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (data(); as d) {
      @if (d.groups.length) {
        <section id="consultas" class="mt-8 scroll-mt-24" aria-labelledby="client-questions-title" data-testid="client-questions">
          <div class="flex flex-wrap items-baseline gap-3 border-b-2 border-ink pb-2.5">
            <h2 id="client-questions-title" class="flex-1 text-lg font-bold">Consultas de profesionales</h2>
            @if (pending()) {
              <span class="rounded-full bg-accent-soft px-2.5 py-0.5 text-[13px] font-semibold text-accent-ink">
                {{ pending() === 1 ? '1 sin responder' : pending() + ' sin responder' }}
              </span>
            }
          </div>
          <p class="mt-2 text-[14px] text-muted">Responder ayuda a que te manden un presupuesto más preciso.</p>
          <ul class="mt-3 flex flex-col gap-4">
            @for (g of d.groups; track g.professional.id) {
              @for (q of g.items; track q.id) {
                <li class="rounded-2xl border border-line bg-surface p-4" [attr.data-question]="q.id">
                  <p class="text-[13.5px] font-semibold text-muted">{{ g.professional.displayName }} pregunta:</p>
                  <p class="mt-0.5 text-[15.5px] leading-snug break-words whitespace-pre-line text-ink">{{ q.question }}</p>
                  @if (q.answer) {
                    <div class="mt-2.5 border-l-2 border-brand-line pl-3">
                      <p class="text-[13px] font-semibold text-brand-dark">Tu respuesta</p>
                      <p class="mt-0.5 text-[15px] leading-snug break-words whitespace-pre-line text-ink-soft">{{ q.answer }}</p>
                    </div>
                  } @else if (d.canAnswer) {
                    <form class="mt-3" novalidate (submit)="$event.preventDefault(); send(q)">
                      <label [for]="'answer-' + q.id" class="sr-only">Tu respuesta a {{ g.professional.displayName }}</label>
                      <textarea
                        [id]="'answer-' + q.id"
                        rows="2"
                        [attr.maxlength]="max"
                        placeholder="Escribí tu respuesta"
                        class="w-full rounded-xl field-control px-3.5 py-3 text-[15px]"
                        [attr.aria-describedby]="'answer-help-' + q.id"
                        [value]="drafts()[q.id] ?? ''"
                        (input)="setDraft(q.id, $any($event.target).value)"
                      ></textarea>
                      <p [id]="'answer-help-' + q.id" class="mt-1 text-[13px] text-muted">
                        Sin teléfonos ni direcciones exactas: se comparten cuando elegís un presupuesto.
                      </p>
                      @if (errors()[q.id]; as e) {
                        <p class="mt-1.5 text-[14px] font-medium text-danger" role="alert">{{ e }}</p>
                      }
                      <button
                        type="submit"
                        class="button-primary mt-2.5 inline-flex min-h-11 items-center gap-1.5 rounded-xl px-4 text-[14.5px] font-semibold disabled:opacity-60"
                        [disabled]="busy() === q.id"
                      >
                        <app-icon name="send" [size]="15" />{{ busy() === q.id ? 'Enviando…' : 'Responder' }}
                      </button>
                    </form>
                  } @else {
                    <p class="mt-2 text-[14px] text-muted">La solicitud ya no recibe presupuestos.</p>
                  }
                </li>
              }
            }
          </ul>
          @if (status(); as s) {
            <p class="sr-only" role="status">{{ s }}</p>
          }
        </section>
      }
    }
  `,
})
export class ClientQuestionsPanel {
  readonly requestId = input.required<string>();
  private readonly api = inject(ProToolsApiService);
  protected readonly max = QUESTION_MAX_LENGTH;
  protected readonly data = signal<ClientQuestions | null>(null);
  protected readonly drafts = signal<Record<string, string>>({});
  protected readonly errors = signal<Record<string, string | null>>({});
  protected readonly busy = signal<string | null>(null);
  protected readonly status = signal<string | null>(null);
  protected readonly pending = computed(
    () => this.data()?.groups.reduce((n, g) => n + g.items.filter((q) => !q.answer).length, 0) ?? 0,
  );

  constructor() {
    effect(() => {
      const id = this.requestId();
      untracked(() => void this.load(id));
    });
  }

  private async load(id: string): Promise<void> {
    try {
      this.data.set(await firstValueFrom(this.api.clientQuestions(id)));
    } catch {
      this.data.set(null);
    }
  }

  protected setDraft(id: string, value: string): void {
    this.drafts.update((d) => ({ ...d, [id]: value }));
  }

  private setError(id: string, message: string | null): void {
    this.errors.update((e) => ({ ...e, [id]: message }));
  }

  protected async send(q: RequestQuestion): Promise<void> {
    const text = (this.drafts()[q.id] ?? '').trim();
    const contact = text ? contactInText(text) : null;
    if (!text) return this.setError(q.id, 'Escribí tu respuesta.');
    if (contact) return this.setError(q.id, `No incluyas ${contact === 'EMAIL' ? 'emails' : 'teléfonos'}: se comparten al elegir un presupuesto.`);
    this.busy.set(q.id);
    this.setError(q.id, null);
    try {
      this.data.set(await firstValueFrom(this.api.answer(this.requestId(), q.id, text)));
      this.status.set('Respuesta enviada.');
    } catch (e) {
      const err = classifyError(e);
      this.setError(
        q.id,
        err.code === 'QUESTION_ALREADY_ANSWERED'
          ? 'Ya respondiste esta consulta.'
          : err.code === 'QUESTION_NOT_ALLOWED'
            ? 'La solicitud ya no recibe presupuestos.'
            : err.code === 'INVALID_QUESTION'
              ? 'Revisá la respuesta: sin teléfonos ni emails, hasta 500 caracteres.'
              : 'No pudimos enviar la respuesta. Probá de nuevo.',
      );
    } finally {
      this.busy.set(null);
    }
  }
}
