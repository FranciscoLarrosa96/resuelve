import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Meta, Title } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map, of } from 'rxjs';
import { ProfessionalsApiService } from '../../../core/api/professionals-api.service';
import { CatalogStore } from '../../../core/state/catalog.store';
import { CatalogError } from '../../../shared/components/catalog-error/catalog-error';
import { ServiceIcon } from '../../../shared/components/icon/service-icon';
import {
  LANDING_PROFESSIONALS_LIMIT,
  LandingService,
  landingCopy,
  landingProfessionals,
  ratingText,
} from './service-landing-content';

/**
 * Página pública de un servicio ("Plomería en Tandil"). El texto sale de `service-landing-content` (el mismo que
 * le sirve `api/service-page.ts` a los buscadores) y los datos, del catálogo real. Servicio inexistente: sin indexar.
 */
@Component({
  selector: 'app-service-landing-page',
  imports: [RouterLink, CatalogError, ServiceIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Sin <main> propio: ya lo pone ClientShell. -->
    <div class="mx-auto max-w-200 px-5 pt-8 pb-20">
      <a routerLink="/servicios" class="text-sm font-semibold text-brand">← Todos los servicios</a>
      @if (service(); as s) {
        @let copy = copyFor(s);
        @if (copy.kicker) {
          <p class="mt-5 text-sm font-semibold tracking-wide text-brand uppercase">{{ copy.kicker }}</p>
        }
        <h1 [class.mt-5]="!copy.kicker" [class.mt-2]="!!copy.kicker" class="flex items-center gap-3 font-display text-[clamp(34px,4vw,48px)] leading-[1.1] font-bold tracking-[-0.02em]">
          <app-service-icon [slug]="s.slug" [size]="36" class="text-brand" />{{ copy.heading }}
        </h1>
        <p class="mt-3 text-[17px] leading-[1.5] text-ink-soft">{{ copy.intro }}</p>
        <a
          [routerLink]="['/profesionales']"
          [queryParams]="{ servicio: s.slug }"
          class="button-primary mt-6 inline-flex h-13 items-center rounded-xl px-5.5 text-[15.5px] font-semibold"
          >Ver profesionales de {{ s.name.toLowerCase() }}</a
        >
        @if (professionals().length) {
          <h2 class="mt-12 font-display text-2xl font-bold">{{ copy.professionalsHeading }}</h2>
          <ul class="mt-3 divide-y divide-line-soft">
            @for (p of professionals(); track p.slug) {
              <li>
                <a [routerLink]="['/p', p.slug]" class="flex flex-col gap-0.5 py-3.5 hover:text-brand">
                  <span class="text-[17px] font-semibold">{{ p.displayName }}</span>
                  @if (p.headline || rating(p)) {
                    <span class="text-[15px] text-ink-soft">{{ p.headline }}{{ p.headline && rating(p) ? ' · ' : '' }}{{ rating(p) }}</span>
                  }
                </a>
              </li>
            }
          </ul>
        }
        @if (copy.guide; as guide) {
          <h2 class="mt-12 font-display text-2xl font-bold">Trabajos que suelen pedirse</h2>
          <ul class="mt-4 list-disc space-y-1.5 pl-5 text-[16.5px] leading-[1.45]">
            @for (job of guide.jobs; track job) {
              <li>{{ job }}</li>
            }
          </ul>
          <h2 class="mt-12 font-display text-2xl font-bold">Antes de pedir tu presupuesto</h2>
          <ul class="mt-4 list-disc space-y-1.5 pl-5 text-[16.5px] leading-[1.45]">
            @for (tip of guide.tips; track tip) {
              <li>{{ tip }}</li>
            }
          </ul>
        }
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
        <h2 class="mt-12 font-display text-2xl font-bold">Preguntas frecuentes</h2>
        <div class="mt-4 flex flex-col gap-5">
          @for (f of copy.faq; track f.question) {
            <div>
              <h3 class="text-[17px] font-semibold">{{ f.question }}</h3>
              <p class="mt-1 text-[16px] leading-[1.5] text-ink-soft">{{ f.answer }}</p>
            </div>
          }
        </div>
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
    </div>
  `,
})
export class ServiceLandingPage {
  protected readonly catalog = inject(CatalogStore);
  private readonly api = inject(ProfessionalsApiService);
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

  /** Profesionales reales del servicio (los mismos que ve el buscador). Si falla, la página sale sin la lista. */
  private readonly professionalsResource = rxResource({
    params: () => this.service()?.slug,
    stream: ({ params: slug }) =>
      slug ? this.api.getProfessionals({ service: slug, pageSize: LANDING_PROFESSIONALS_LIMIT }).pipe(map((page) => landingProfessionals(page.items))) : of([]),
  });
  protected readonly professionals = computed(() => (this.professionalsResource.hasValue() ? this.professionalsResource.value() : []));

  protected copyFor = landingCopy;
  protected rating = ratingText;

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
