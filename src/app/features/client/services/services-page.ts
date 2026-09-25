import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { findServices, SERVICE_CATEGORIES } from '../../../core/data/services.data';
import { CategoryName } from '../../../core/models/category';
import { RequestStore } from '../../../core/state/request.store';
import { SearchStore } from '../../../core/state/search.store';

@Component({
  selector: 'app-services-page',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="mx-auto max-w-5xl px-5 pt-8 pb-20 md:px-8">
      <a routerLink="/" class="text-sm font-semibold text-brand">← Volver al inicio</a>
      <h1 class="mt-5 font-display text-3xl font-extrabold tracking-[-0.03em]">Todos los servicios</h1>
      <p class="mt-2 text-muted">Buscá el servicio que necesitás y encontrá profesionales en Tandil.</p>
      <label for="service-catalog-search" class="sr-only">Buscar servicio</label>
      <input id="service-catalog-search" type="search" placeholder="Buscar servicio..." autocomplete="off"
        class="mt-6 w-full rounded-2xl border border-line-input bg-white px-4 py-3 text-base outline-none focus:border-brand"
        [value]="query()" (input)="query.set($any($event.target).value)" />
      @for (category of categories; track category) {
        @if (inCategory(category).length) {
          <section class="mt-8">
            <h2 class="font-display text-xl font-bold">{{ category }}</h2>
            <div class="mt-3 divide-y divide-line-soft rounded-2xl border border-line bg-white px-4">
              @for (service of inCategory(category); track service.id) {
                <button type="button" class="flex w-full items-center justify-between py-3.5 text-left text-[15px] font-medium hover:text-brand"
                  (click)="choose(service.id)">{{ service.id }} <span aria-hidden="true">→</span></button>
              }
            </div>
          </section>
        }
      } @empty {
        <p class="mt-6 text-muted">No encontramos ese servicio.</p>
      }
      @if (!matches().length) { <p class="mt-6 text-muted">No encontramos ese servicio.</p> }
    </main>
  `,
})
export class ServicesPage {
  private readonly router = inject(Router);
  private readonly request = inject(RequestStore);
  private readonly search = inject(SearchStore);
  protected readonly categories = SERVICE_CATEGORIES;
  protected readonly query = signal('');
  protected readonly matches = computed(() => findServices(this.query()));

  protected inCategory(category: (typeof SERVICE_CATEGORIES)[number]) {
    return this.matches().filter((service) => service.category === category);
  }

  protected choose(id: CategoryName): void {
    this.request.resetForNewRequest();
    this.search.resetForNewRequest();
    this.request.setCategory(id);
    this.router.navigate(['/profesionales']);
  }
}
