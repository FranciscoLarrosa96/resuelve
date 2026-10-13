import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { classifyError } from '../../../core/api/api-error';
import { ProToolsApiService } from '../../../core/api/pro-tools-api.service';
import { REVIEW_REPLY_MAX_LENGTH } from '../../../core/models/pro-tools';
import { ProfessionalReview } from '../../../core/models/professional';
import { contactInText } from '../../../core/utils/contact-in-text';
import { Stars } from '../../../shared/components/stars/stars';

const MONTH = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric', timeZone: 'America/Argentina/Buenos_Aires' });

/**
 * "Tus reseñas" en Mi perfil: todas las reseñas visibles (por Resuelve y de
 * clientes invitados) con la respuesta pública del profesional. Responder no
 * cambia el puntaje ni oculta nada; la respuesta se ve en el perfil.
 */
@Component({
  selector: 'app-review-replies',
  imports: [Stars],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <section
      id="profile-reviews"
      class="presence-section rounded-2xl border border-line bg-surface p-5 md:p-6"
      aria-labelledby="sec-reviews"
      data-testid="review-replies"
    >
      <h2 id="sec-reviews" class="text-[17px] leading-6 font-bold">Tus reseñas</h2>
      <p class="text-[14px] text-muted">Respondé en público: agradecé o aclará. Tu respuesta se ve debajo de cada reseña.</p>

      @if (error() && !items().length) {
        <p class="mt-3 text-[14px] text-danger" role="alert">
          No pudimos cargar tus reseñas.
          <button type="button" class="font-semibold underline" (click)="load(1)">Reintentar</button>
        </p>
      } @else if (!loaded()) {
        <div class="mt-4 grid gap-2" aria-hidden="true">
          <div class="shimmer h-4 w-1/3 rounded-md"></div>
          <div class="shimmer h-4 w-2/3 rounded-md"></div>
        </div>
      } @else if (!items().length) {
        <p class="mt-3 text-[15px] text-ink-soft">Todavía no tenés reseñas. Cuando llegue la primera, la vas a poder responder acá.</p>
      } @else {
        <ul class="mt-3 divide-y divide-line-soft border-t border-line-soft">
          @for (r of items(); track r.id) {
            <li class="py-4" [attr.data-review]="r.id">
              <div class="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <app-stars [rating]="r.rating" [size]="14" />
                <span class="text-[14px] text-muted">{{ r.reviewerDisplayName }} · {{ month(r.createdAt) }}</span>
                @if (r.invited) {
                  <span class="rounded-full bg-sand px-2 py-0.5 text-[12.5px] font-semibold text-ink-soft">Cliente invitado</span>
                }
              </div>
              @if (r.comment) {
                <p class="mt-1.5 text-[15px] leading-normal break-words text-ink-soft">“{{ r.comment }}”</p>
              }

              @if (editingId() === r.id) {
                <form class="mt-3" novalidate (submit)="$event.preventDefault(); save(r)">
                  <label [for]="'reply-' + r.id" class="text-[14px] font-semibold">Tu respuesta pública</label>
                  <textarea
                    [id]="'reply-' + r.id"
                    rows="3"
                    [attr.maxlength]="max"
                    class="mt-1.5 w-full rounded-xl field-control px-3.5 py-3 text-[15px]"
                    [attr.aria-describedby]="'reply-help-' + r.id"
                    [attr.aria-invalid]="!!formError()"
                    [value]="draft()"
                    (input)="draft.set($any($event.target).value)"
                  ></textarea>
                  <p [id]="'reply-help-' + r.id" class="mt-1 flex justify-between gap-3 text-[13px] text-muted">
                    <span>Sin teléfonos ni emails.</span><span class="tabular-nums">{{ draft().length }}/{{ max }}</span>
                  </p>
                  @if (formError(); as e) {
                    <p class="mt-1.5 text-[14px] font-medium text-danger" role="alert">{{ e }}</p>
                  }
                  <div class="mt-3 flex flex-wrap gap-2">
                    <button type="submit" class="button-primary min-h-11 rounded-xl px-4 text-[14.5px] font-semibold disabled:opacity-60" [disabled]="busy()">
                      {{ busy() ? 'Guardando…' : 'Publicar respuesta' }}
                    </button>
                    <button type="button" class="min-h-11 rounded-xl px-4 text-[14.5px] font-semibold text-ink-soft hover:bg-sand" [disabled]="busy()" (click)="cancel()">
                      Cancelar
                    </button>
                  </div>
                </form>
              } @else if (r.reply; as reply) {
                <div class="mt-3 border-l-2 border-brand-line pl-3">
                  <p class="text-[13.5px] font-semibold text-ink">Tu respuesta</p>
                  <p class="mt-0.5 text-[14.5px] leading-normal break-words whitespace-pre-line text-ink-soft">{{ reply.text }}</p>
                  <div class="mt-1 flex gap-1">
                    <button type="button" class="-ml-2 min-h-11 px-2 text-[14px] font-semibold text-brand hover:underline" (click)="startEdit(r)">Editar</button>
                    <button type="button" class="min-h-11 px-2 text-[14px] font-semibold text-muted hover:text-danger" [disabled]="busy()" (click)="remove(r)">Borrar</button>
                  </div>
                </div>
              } @else {
                <button
                  type="button"
                  class="mt-2 -ml-2 min-h-11 px-2 text-[14.5px] font-semibold text-brand hover:underline"
                  [attr.aria-label]="'Responder la reseña de ' + r.reviewerDisplayName"
                  (click)="startEdit(r)"
                >
                  Responder
                </button>
              }
            </li>
          }
        </ul>
        @if (hasMore()) {
          <button
            type="button"
            class="mt-3 h-11 rounded-xl button-secondary px-4 text-[14px] font-semibold disabled:opacity-60"
            [disabled]="loading()"
            (click)="load(page() + 1)"
          >
            {{ loading() ? 'Cargando…' : 'Ver más reseñas' }}
          </button>
        }
        @if (status(); as s) {
          <p class="sr-only" role="status">{{ s }}</p>
        }
      }
    </section>
  `,
})
export class ReviewReplies {
  private readonly api = inject(ProToolsApiService);
  protected readonly max = REVIEW_REPLY_MAX_LENGTH;

  protected readonly items = signal<ProfessionalReview[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(0);
  protected readonly loaded = signal(false);
  protected readonly loading = signal(false);
  protected readonly error = signal(false);
  protected readonly hasMore = computed(() => this.items().length < this.total());

  protected readonly editingId = signal<string | null>(null);
  protected readonly draft = signal('');
  protected readonly formError = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly status = signal<string | null>(null);

  constructor() {
    void this.load(1);
  }

  protected month(iso: string): string {
    return MONTH.format(new Date(iso));
  }

  protected async load(page: number): Promise<void> {
    this.loading.set(true);
    this.error.set(false);
    try {
      const res = await firstValueFrom(this.api.ownReviews(page));
      this.items.update((list) => (page === 1 ? res.items : [...list, ...res.items]));
      this.total.set(res.total);
      this.page.set(page);
    } catch {
      this.error.set(true);
    } finally {
      this.loading.set(false);
      this.loaded.set(true);
    }
  }

  protected startEdit(r: ProfessionalReview): void {
    this.editingId.set(r.id);
    this.draft.set(r.reply?.text ?? '');
    this.formError.set(null);
  }

  protected cancel(): void {
    this.editingId.set(null);
    this.formError.set(null);
  }

  protected async save(r: ProfessionalReview): Promise<void> {
    const text = this.draft().trim();
    const problem = !text
      ? 'Escribí tu respuesta.'
      : contactInText(text) === 'EMAIL'
        ? 'No incluyas emails en la respuesta.'
        : contactInText(text) === 'PHONE'
          ? 'No incluyas teléfonos en la respuesta.'
          : null;
    if (problem) return this.formError.set(problem);
    this.busy.set(true);
    try {
      const updated = await firstValueFrom(this.api.replyReview(r.id, text));
      this.replace(updated);
      this.editingId.set(null);
      this.status.set('Respuesta publicada.');
    } catch (e) {
      const err = classifyError(e);
      this.formError.set(
        err.code === 'INVALID_REVIEW_REPLY'
          ? 'Revisá la respuesta: sin teléfonos ni emails, hasta 500 caracteres.'
          : err.kind === 'not-found'
            ? 'Esta reseña ya no está disponible.'
            : 'No pudimos publicar la respuesta. Probá de nuevo.',
      );
    } finally {
      this.busy.set(false);
    }
  }

  protected async remove(r: ProfessionalReview): Promise<void> {
    this.busy.set(true);
    try {
      this.replace(await firstValueFrom(this.api.deleteReply(r.id)));
      this.status.set('Respuesta borrada.');
    } catch {
      this.status.set('No pudimos borrar la respuesta. Probá de nuevo.');
    } finally {
      this.busy.set(false);
    }
  }

  private replace(review: ProfessionalReview): void {
    this.items.update((list) => list.map((x) => (x.id === review.id ? { ...x, reply: review.reply ?? null } : x)));
  }
}
