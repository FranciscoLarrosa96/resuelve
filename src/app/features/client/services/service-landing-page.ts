import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { CatalogStore } from '../../../core/state/catalog.store';
import { CatalogError } from '../../../shared/components/catalog-error/catalog-error';
import { ServiceIcon } from '../../../shared/components/icon/service-icon';
import { LandingService, landingCopy } from './service-landing-content';

/**
 * Página pública de un servicio ("Plomería en Tandil"). El texto sale de `service-landing-content` (el mismo que
 * le sirve `api/service-page.ts` a los buscadores) y los datos, del catálogo real. Servicio inexistente: sin indexar.
 */
@Component({
  selector: 'app-service-landing-page',
  imports: [RouterLink, CatalogError, ServiceIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="mx-auto max-w-200 px-5 pt-8 pb-20">
      <a routerLink="/servicios" class="text-sm font-semibold text-brand">← Todos los servicios</a>
      @if (service(); as s) {
        @let copy = copyFor(s);
        <h1 class="mt-5 flex items-center gap-3 font-display text-[clamp(34px,4vw,48px)] leading-[1.1] font-bold tracking-[-0.02em]">
          <app-service-icon [slug]="s.slug" [size]="36" class="text-brand" />{{ copy.heading }}
        </h1>
        <p class="mt-3 text-[17px] leading-[1.5] text-ink-soft">{{ copy.intro }}</p>
        <a
          [routerLink]="['/profesionales']"
          [queryParams]="{ servicio: s.slug }"
          class="button-primary mt-6 inline-flex h-13 items-center rounded-xl px-5.5 text-[15.5px] font-semibold"
          >Ver profesionales de {{ s.name.toLowerCase() }}</a
        >
        <h2 class="mt-12 font-display text-2xl font-bold">Cómo funciona</h2>
        <ol class="mt-4 flex flex-col gap-4">
          @for (step of copy.steps; track step.title; let i = $index) {
            <li class="flex gap-4">
              <span class="font-display text-2xl font-bold text-brand" aria-hidden="true">{{ i + 1 }}</span>
              <span><strong>{{ step.title }}.</strong> {{ step.text }}</span>
            </li>
          }
        </ol>
        @if (copy.licenseNote) {
          <p class="mt-6 rounded-2xl border border-line bg-surface px-4 py-3 text-[15px] text-ink-soft">{{ copy.licenseNote }}</p>
        }
        @if (related().length) {
          <h2 class="mt-12 font-display text-2xl font-bold">Otros servicios de {{ s.category.name }}</h2>
          <ul class="mt-3 divide-y divide-line-soft">
            @for (r of related(); track r.slug) {
              <li>
                <a [routerLink]="['/servicios', r.slug]" class="flex items-center justify-between py-3.5 text-[17px] font-semibold hover:text-brand"
                  >{{ r.name }}<span aria-hidden="true">→</span></a
                >
              </li>
            }
          </ul>
        }
      } @else if (catalog.error()) {
        <div class="mt-8"><app-catalog-error /></div>
      } @else if (catalog.loaded()) {
        <h1 class="mt-5 font-display text-[clamp(34px,4vw,48px)] font-bold">Este servicio no existe</h1>
        <p class="mt-3 text-[17px] text-ink-soft">Mirá todos los servicios disponibles en Tandil.</p>
        <a routerLink="/servicios" class="button-primary mt-6 inline-flex h-13 items-center rounded-xl px-5.5 text-[15.5px] font-semibold">Ver los servicios</a>
      } @else {
        <div class="mt-8 flex flex-col gap-4" aria-hidden="true">
          <div class="shimmer h-10 w-[60%] rounded-md"></div>
          <div class="shimmer h-5 w-[80%] rounded-md"></div>
        </div>
        <p class="sr-only" role="status">Cargando servicio…</p>
      }
    </main>
  `,
})
export class ServiceLandingPage {
  protected readonly catalog = inject(CatalogStore);
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly slug = toSignal(inject(ActivatedRoute).paramMap.pipe(map((p) => p.get('slug'))), { initialValue: null });

  protected readonly service = computed<LandingService | null>(() => {
    const found = this.catalog.serviceBySlug(this.slug());
    const category = found && this.catalog.categoryOf(found);
    return found && category
      ? { name: found.name, slug: found.slug, requiresLicense: found.requiresLicense, category: { name: category.name, slug: category.slug } }
      : null;
  });

  protected readonly related = computed<LandingService[]>(() => {
    const current = this.service();
    const group = current && this.catalog.servicesByCategory().find((g) => g.category.slug === current.category.slug);
    return (group?.services ?? [])
      .filter((s) => s.slug !== current!.slug)
      .map((s) => ({ name: s.name, slug: s.slug, requiresLicense: s.requiresLicense, category: current!.category }));
  });

  protected copyFor = landingCopy;

  constructor() {
    this.catalog.loadCatalog();
    effect(() => {
      const s = this.service();
      if (s) {
        const copy = landingCopy(s);
        this.title.setTitle(copy.title);
        this.meta.updateTag({ name: 'description', content: copy.description });
        this.meta.removeTag("name='robots'");
      } else if (this.catalog.loaded()) {
        this.title.setTitle('Servicio no encontrado · Resuelve');
        this.meta.updateTag({ name: 'robots', content: 'noindex, nofollow' });
      }
    });
  }
}
