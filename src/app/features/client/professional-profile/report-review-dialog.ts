import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, effect, inject, input, output, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ProfessionalsApiService } from '../../../core/api/professionals-api.service';
import { ReviewReportReason } from '../../../core/models/professional';
import { Dialog } from '../../../shared/components/dialog/dialog';

const REASONS: { value: ReviewReportReason; label: string }[] = [
  { value: 'FAKE', label: 'Es falsa o de alguien que no trabajó con esta persona' },
  { value: 'OFFENSIVE', label: 'Insulta, amenaza o muestra datos personales' },
  { value: 'SPAM', label: 'Es publicidad o spam' },
  { value: 'OTHER', label: 'Otro motivo' },
];

/** Mismo criterio que el backend (NO_HTML): nada con forma de etiqueta. */
const LOOKS_LIKE_HTML = /<\s*[/!]?\s*[a-z]/i;

/**
 * "Reportar reseña": motivo + detalle opcional. NO oculta nada: la revisa una persona de Resuelve
 * (`npm run reviews:moderation`). Con `reviewId` en null queda cerrado.
 */
@Component({
  selector: 'app-report-review-dialog',
  imports: [FormsModule, Dialog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-dialog [open]="!!reviewId()" labelledBy="report-review-title" [dismissable]="!sending()" (dismiss)="closed.emit()">
      @if (sent()) {
        <h2 id="report-review-title" class="font-display text-2xl font-bold">Gracias por avisarnos</h2>
        <p class="mt-2 text-[15px] leading-6 text-muted">
          Vamos a revisar la reseña. Si no cumple las reglas de Resuelve, la ocultamos. No te vamos a
          mostrar quién la dejó ni hace falta que hagas nada más.
        </p>
        <button
          type="button"
          class="button-primary mt-5 min-h-12 w-full rounded-xl px-5 text-[16px] font-semibold"
          (click)="closed.emit()"
        >
          Listo
        </button>
      } @else {
        <h2 id="report-review-title" class="font-display text-2xl font-bold">Reportar reseña</h2>
        <form class="mt-3" novalidate (ngSubmit)="submit()">
          <fieldset [disabled]="sending()">
            <legend class="text-[15px] text-muted">¿Qué pasa con esta reseña?</legend>
            <div class="mt-2 flex flex-col gap-1">
              @for (r of reasons; track r.value) {
                <label
                  class="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-line px-3.5 py-2 text-[15px] has-[:checked]:border-brand has-[:checked]:bg-brand-tint"
                >
                  <input type="radio" name="report-reason" class="size-4 shrink-0 accent-brand" [value]="r.value" [(ngModel)]="reason" />
                  <span>{{ r.label }}</span>
                </label>
              }
            </div>
          </fieldset>
          <label for="report-details" class="mt-4 block text-[15px] font-semibold text-ink">
            Detalle <span class="font-normal text-muted">(opcional)</span>
          </label>
          <textarea
            id="report-details"
            name="details"
            rows="3"
            maxlength="500"
            [(ngModel)]="details"
            [disabled]="sending()"
            [attr.aria-invalid]="detailsInvalid() ? 'true' : null"
            class="mt-1.5 w-full min-w-0 resize-y rounded-xl field-control px-3.5 py-3 text-base text-ink aria-invalid:border-danger"
          ></textarea>
          @if (detailsInvalid()) {
            <p class="mt-1 text-[14px] font-medium text-danger">Escribí solo texto, sin etiquetas HTML.</p>
          }
          @if (error()) {
            <p class="mt-3 rounded-xl bg-danger-soft px-3.5 py-2.5 text-[14px] font-medium text-danger" role="alert">{{ error() }}</p>
          }
          <div class="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
            <button
              type="submit"
              class="button-primary min-h-12 rounded-xl px-5 text-[16px] font-semibold disabled:opacity-60 sm:flex-1"
              [disabled]="sending() || !reason()"
              data-testid="report-submit"
            >
              {{ sending() ? 'Enviando…' : 'Enviar reporte' }}
            </button>
            <button
              type="button"
              class="button-secondary min-h-12 rounded-xl px-5 text-[16px] font-semibold sm:flex-1"
              [disabled]="sending()"
              (click)="closed.emit()"
            >
              Cancelar
            </button>
          </div>
        </form>
      }
    </app-dialog>
  `,
})
export class ReportReviewDialog {
  private readonly api = inject(ProfessionalsApiService);
  /** Reseña a reportar; null = cerrado. */
  readonly reviewId = input<string | null>(null);
  readonly closed = output<void>();

  protected readonly reasons = REASONS;
  protected readonly reason = signal<ReviewReportReason | null>(null);
  protected readonly details = signal('');
  protected readonly sending = signal(false);
  protected readonly sent = signal(false);
  protected readonly error = signal<string | null>(null);
  protected detailsInvalid = () => LOOKS_LIKE_HTML.test(this.details());

  constructor() {
    // Cada vez que se abre para otra reseña, el formulario arranca limpio.
    effect(() => {
      if (this.reviewId()) {
        untracked(() => {
          this.reason.set(null);
          this.details.set('');
          this.sent.set(false);
          this.error.set(null);
        });
      }
    });
  }

  protected submit(): void {
    const id = this.reviewId();
    const reason = this.reason();
    if (!id || !reason || this.sending() || this.detailsInvalid()) return;
    this.sending.set(true);
    this.error.set(null);
    const details = this.details().trim();
    this.api.reportReview(id, { reason, ...(details ? { details } : {}) }).subscribe({
      next: () => {
        this.sending.set(false);
        this.sent.set(true);
      },
      error: (err: unknown) => {
        this.sending.set(false);
        const status = err instanceof HttpErrorResponse ? err.status : 0;
        this.error.set(
          status === 409
            ? 'No podés reportar tu propia reseña.'
            : status === 404
              ? 'Esta reseña ya no está disponible.'
              : 'No pudimos enviar el reporte. Probá de nuevo.',
        );
      },
    });
  }
}
