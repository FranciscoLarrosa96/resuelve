import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { REQUEST_LIMITS } from '../../../core/models/request';
import { RequestStore } from '../../../core/state/request.store';

/**
 * "Contá qué necesitás": la descripción del pedido, UNA sola implementación para el asistente
 * (/solicitud) y para /presupuesto cuando falta. Escribe en `RequestStore.draft` (única fuente);
 * nunca cambia el servicio elegido: si el texto sugiere otro, lo ofrece con un botón.
 */
@Component({
  selector: 'app-request-description-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block', 'data-testid': 'description-field' },
  template: `
    <label [for]="idPrefix() + '-desc'" class="text-[15px] font-semibold">{{ label() }}</label>
    <textarea
      [id]="idPrefix() + '-desc'"
      rows="4"
      [attr.maxlength]="limits.descriptionMax"
      placeholder="Ej: Gotea la canilla de la cocina desde ayer, abajo de la mesada."
      class="mt-2 w-full resize-y rounded-2xl border-[1.5px] bg-surface px-3.5 py-3 text-[15.5px] leading-[1.45] text-ink outline-none focus:border-brand disabled:opacity-60"
      [class]="short() && touched() ? 'border-accent-line' : 'border-line-input'"
      [attr.aria-describedby]="idPrefix() + '-desc-hint'"
      [attr.aria-invalid]="short() && touched()"
      [value]="value()"
      [disabled]="disabled()"
      (input)="onInput($event)"
      (blur)="touched.set(true)"
    ></textarea>
    <p
      [id]="idPrefix() + '-desc-hint'"
      class="mt-1.5 text-[14px] leading-[1.45]"
      [class]="short() && touched() ? 'font-medium text-accent-strong' : 'text-muted'"
    >
      Mínimo {{ limits.descriptionMin }} caracteres. Lo leen los profesionales para darte un precio.
    </p>
    @if (suggestion(); as s) {
      <p class="mt-2.5 flex flex-wrap items-center gap-x-2 text-[14px] text-ink-soft" role="status" data-testid="suggested-service">
        Por lo que contás, parece ser {{ s.service.name }}.
        <button type="button" class="min-h-10 font-semibold text-brand underline" (click)="useSuggestion()">
          Usar {{ s.service.name }}
        </button>
      </p>
    }
  `,
})
export class RequestDescriptionField {
  private readonly store = inject(RequestStore);
  protected readonly limits = REQUEST_LIMITS;

  /** Prefijo de ids (puede haber una instancia en desktop y otra en mobile). */
  readonly idPrefix = input.required<string>();
  readonly label = input('Contá qué necesitás');
  readonly disabled = input(false);

  /** Lo que se ve en el campo: no se pisa mientras la persona escribe (el store guarda el texto recortado). */
  protected readonly value = signal(this.store.draft().description);
  protected readonly touched = signal(false);
  protected readonly short = computed(() => this.store.descriptionMissing());
  protected readonly suggestion = computed(() => this.store.suggestedService(this.value()));

  constructor() {
    // Cambios de afuera (p. ej. el Home escribió el texto): se reflejan solo si difieren de lo que se ve.
    effect(() => {
      const stored = this.store.draft().description;
      untracked(() => {
        if (stored !== this.value().trim()) this.value.set(stored);
      });
    });
  }

  protected onInput(event: Event): void {
    const text = (event.target as HTMLTextAreaElement).value;
    this.value.set(text);
    this.store.updateDescription(text);
  }

  protected useSuggestion(): void {
    const s = this.suggestion();
    if (s) this.store.useSuggestedService(s);
  }
}
