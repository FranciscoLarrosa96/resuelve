import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { CatalogStore } from '../../../core/state/catalog.store';

/** Error de carga del catálogo con "Reintentar". Nunca muestra datos mock. */
@Component({
  selector: 'app-catalog-error',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div role="alert" class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-white"
      [class]="compact() ? 'px-3 py-2.5' : 'px-4 py-4'">
      <div class="min-w-0">
        <p class="text-[15px] font-semibold text-ink">{{ catalog.error() }}</p>
        @if (!compact()) { <p class="mt-0.5 text-sm text-muted">Revisá tu conexión y volvé a intentar.</p> }
      </div>
      <button type="button" class="rounded-lg border border-line-input bg-white px-3.5 py-2 text-sm font-semibold text-brand hover:bg-brand-tint disabled:opacity-60 press"
        [disabled]="catalog.loading()" (click)="catalog.retry()">{{ catalog.loading() ? 'Reintentando…' : 'Reintentar' }}</button>
    </div>
  `,
})
export class CatalogError {
  protected readonly catalog = inject(CatalogStore);
  readonly compact = input(false);
}
