import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { REVIEW_COMMENT_MAX, ServiceRequest } from '../../../../core/models/request';
import { MyRequestsStore, REVIEW_MESSAGES } from '../../../../core/state/my-requests.store';
import { Stars, StarInput } from '../../../../shared/components/stars/stars';

/** Mismo criterio que el backend (NO_HTML): nada con forma de etiqueta. "<3" pasa. */
const LOOKS_LIKE_HTML = /<\s*[/!]?\s*[a-z]/i;

/**
 * Reseña del trabajo realizado, en el detalle de la solicitud del cliente.
 * - `canReview` (lo decide el backend): CTA → formulario.
 * - Ya hay reseña: "Tu reseña" (o el agradecimiento, si se acaba de publicar).
 * La reseña es opcional y no cambia el estado: el trabajo ya está realizado.
 */
@Component({
  selector: 'app-review-panel',
  imports: [FormsModule, Stars, StarInput],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (request().review; as rv) {
      <section class="mt-4 animate-fade-in rounded-2xl border border-line bg-white p-4.5 sm:p-5" aria-labelledby="review-title">
        <h2 id="review-title" tabindex="-1" class="text-[15px] font-semibold text-ink outline-none">
          {{ justPublished() ? 'Gracias por compartir tu experiencia.' : 'Tu reseña' }}
        </h2>
        <app-stars class="mt-2" [rating]="rv.rating" [size]="16" />
        @if (rv.comment) {
          <p class="mt-2 text-[15px] leading-normal text-pretty break-words text-ink-soft">“{{ rv.comment }}”</p>
        }
        <p class="mt-2.5 text-[13px] text-muted">Se ve en el perfil de {{ firstName() }} con tu nombre de pila.</p>
      </section>
    } @else if (request().canReview) {
      <section class="mt-4 animate-fade-in rounded-2xl border border-line bg-white p-4.5 sm:p-5" aria-labelledby="review-title">
        @if (!open()) {
          <h2 id="review-title" class="text-[15px] font-semibold text-ink">¿Cómo fue tu experiencia con {{ firstName() }}?</h2>
          <p class="mt-1 text-[14px] text-muted">Tu opinión ayuda a otros vecinos a elegir. Es opcional.</p>
          <button type="button" class="mt-3.5 h-11 rounded-xl bg-brand px-5 text-[15px] font-semibold text-white hover:bg-brand-dark press" (click)="start()">Dejar reseña</button>
        } @else {
          <h2 id="review-title" tabindex="-1" class="text-[15px] font-semibold text-ink outline-none">Reseña para {{ firstName() }}</h2>
          <form class="mt-3" novalidate (ngSubmit)="submit()">
            <app-star-input
              [(value)]="rating"
              [name]="'rating-' + request().id"
              [disabled]="store.reviewing()"
              [describedBy]="ratingError() ? 'review-rating-error' : null"
            />
            @if (ratingError()) {
              <p id="review-rating-error" class="mt-1.5 text-[13.5px] font-medium text-danger">Elegí un puntaje de 1 a 5 estrellas.</p>
            }

            <label for="review-comment" class="mt-4 block text-[15px] font-semibold text-ink">
              Comentario <span class="font-normal text-muted">(opcional)</span>
            </label>
            <textarea
              id="review-comment"
              name="comment"
              rows="4"
              [maxlength]="max"
              [(ngModel)]="comment"
              [disabled]="store.reviewing()"
              [attr.aria-invalid]="commentError() ? 'true' : null"
              aria-describedby="review-comment-hint"
              placeholder="Contanos cómo salió el trabajo."
              class="mt-1.5 w-full min-w-0 resize-y rounded-xl border border-line-input bg-white px-3.5 py-3 text-base text-ink outline-none focus:border-brand aria-invalid:border-danger"
            ></textarea>
            <div id="review-comment-hint" class="mt-1 flex justify-between gap-3 text-[12.5px] text-muted">
              <span>{{ commentError() ? 'Escribí solo texto, sin etiquetas HTML.' : 'Solo texto.' }}</span>
              <span class="tabular-nums">{{ comment().length }}/{{ max }}</span>
            </div>

            <p class="mt-3.5 text-[13.5px] leading-[1.45] text-ink-soft">
              Tu reseña y tu nombre de pila podrán verse en el perfil del profesional.
            </p>

            @if (error(); as err) {
              <p class="mt-3 rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-[14px] font-medium text-danger" role="alert">{{ err }}</p>
            }

            <div class="mt-4 flex flex-col gap-2 sm:flex-row">
              <button type="submit" class="h-12 rounded-xl bg-brand px-5 text-[15px] font-semibold text-white hover:bg-brand-dark disabled:opacity-60 press" [disabled]="store.reviewing()">
                {{ store.reviewing() ? 'Publicando…' : 'Publicar reseña' }}
              </button>
              <button type="button" class="h-12 rounded-xl px-4 text-[15px] font-semibold text-ink-soft hover:bg-sand-light disabled:opacity-60" [disabled]="store.reviewing()" (click)="open.set(false)">Ahora no</button>
            </div>
          </form>
        }
      </section>
    }
  `,
})
export class ReviewPanel {
  protected readonly store = inject(MyRequestsStore);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  readonly request = input.required<ServiceRequest>();
  /** Nombre completo del profesional elegido (se usa el de pila). */
  readonly professionalName = input<string | null>(null);

  protected readonly max = REVIEW_COMMENT_MAX;
  protected readonly open = signal(false);
  protected readonly rating = signal<number | null>(null);
  protected readonly comment = signal('');
  protected readonly submitted = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly justPublished = signal(false);

  protected readonly firstName = computed(() => this.professionalName()?.trim().split(/\s+/)[0] || 'el profesional');
  protected readonly ratingError = computed(() => this.submitted() && this.rating() === null);
  protected readonly commentError = computed(() => LOOKS_LIKE_HTML.test(this.comment()));

  protected start(): void {
    this.open.set(true);
    this.focusHeading();
  }

  protected async submit(): Promise<void> {
    if (this.store.reviewing()) return;
    this.submitted.set(true);
    this.error.set(null);
    const rating = this.rating();
    if (rating === null) {
      this.focus('input[type=radio]');
      return;
    }
    if (this.commentError()) {
      this.focus('#review-comment');
      return;
    }
    const comment = this.comment().trim();
    const result = await this.store.review(comment ? { rating, comment } : { rating });
    if (result === 'ok') {
      this.justPublished.set(true);
      this.focusHeading();
    } else if (result === 'already') {
      this.focusHeading();
    } else {
      this.error.set(REVIEW_MESSAGES[result]);
    }
  }

  private focusHeading(): void {
    this.focus('#review-title');
  }

  private focus(selector: string): void {
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>(selector)?.focus(), {
      injector: this.injector,
    });
  }
}
