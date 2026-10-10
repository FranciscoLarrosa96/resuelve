import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Meta, Title } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of } from 'rxjs';
import { PublicLinks } from '../../../core/acquisition/public-links';
import { LocalitiesApiService } from '../../../core/api/localities-api.service';
import { ProfessionalsApiService } from '../../../core/api/professionals-api.service';
import { LocalityDetail, ServedLocality, toLocalityRef } from '../../../core/models/locality';
import { LocalityStore } from '../../../core/state/locality.store';
import { CatalogStore } from '../../../core/state/catalog.store';
import { CatalogError } from '../../../shared/components/catalog-error/catalog-error';
import { ServiceIcon } from '../../../shared/components/icon/service-icon';
import {
  LANDING_PROFESSIONALS_LIMIT,
  LandingPlace,
  LandingService,
  landingCopy,
  landingIndexable,
  landingPath,
  landingProfessionals,
  ratingText,
} from './service-landing-content';

/** Estado de la localidad de la URL (solo en `/ciudades/...`). */
type PlaceState = { kind: 'none' } | { kind: 'loading' } | { kind: 'missing' } | { kind: 'ok'; detail: LocalityDetail };

/**
 * Página pública de un servicio: nacional (`/servicios/plomeria`) o en una localidad
 * (`/ciudades/buenos-aires/tandil/servicios/plomeria`, "Plomeros en Tandil"). El texto sale de
 * `service-landing-content` (el mismo que le sirve `api/service-page.ts` a los buscadores) y los datos, del catálogo
 * y de los perfiles reales. Servicio o localidad inexistente, o localidad sin profesionales del servicio: sin indexar.
 */
@Component({
  selector: 'app-service-landing-page',
  imports: [RouterLink, CatalogError, ServiceIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Sin <main> propio: ya lo pone ClientShell. -->
    <div class="mx-auto max-w-200 px-5 pt-8 pb-20">
      <nav aria-label="Migas de pan" class="text-sm font-semibold text-brand">
        <a routerLink="/servicios">Servicios</a>
        @if (place() && service(); as s) {
          <span class="text-muted" aria-hidden="true"> › </span><a [routerLink]="['/servicios', service()!.slug]">{{ service()!.name }}</a
          ><span class="text-muted" aria-hidden="true"> › </span><span class="text-ink-soft" aria-current="page">{{ place()!.name }}</span>
        }
      </nav>
      @if (placeState().kind === 'missing') {
        <h1 class="mt-5 font-display text-[clamp(34px,4vw,48px)] font-bold">No encontramos esa localidad</h1>
        <p class="mt-3 text-[17px] text-ink-soft">Revisá el enlace o buscá el servicio en tu ciudad.</p>
        <a routerLink="/servicios" class="button-primary mt-6 inline-flex h-13 items-center rounded-xl px-5.5 text-[15.5px] font-semibold">Ver los servicios</a>
      } @else if (service(); as s) {
        @let copy = copyFor(s, place());
        @if (copy.kicker) {
          <p class="mt-5 text-sm font-semibold tracking-wide text-brand uppercase">{{ copy.kicker }}</p>
        }
        <h1 [class.mt-5]="!copy.kicker" [class.mt-2]="!!copy.kicker" class="flex items-center gap-3 font-display text-[clamp(34px,4vw,48px)] leading-[1.1] font-bold tracking-[-0.02em]">
          <app-service-icon [slug]="s.slug" [size]="36" class="text-brand" />{{ copy.heading }}
        </h1>
        <p class="mt-3 text-[17px] leading-[1.5] text-ink-soft">{{ copy.intro }}</p>
        @if (place(); as pl) {
          <a
            [routerLink]="['/profesionales']"
            [queryParams]="{ servicio: s.slug, provincia: pl.province.slug, ciudad: pl.slug }"
            class="button-primary mt-6 inline-flex h-13 items-center rounded-xl px-5.5 text-[15.5px] font-semibold"
            >Ver profesionales de {{ s.name.toLowerCase() }} en {{ pl.name }}</a
          >
          @if (placeState().kind === 'ok' && !placeCount()) {
            <p class="mt-6 rounded-2xl border border-line bg-surface px-4 py-3 text-[15px] text-ink-soft" role="status">
              Todavía no hay profesionales de {{ s.name.toLowerCase() }} que trabajen en {{ pl.name }}. Si ofrecés este
              servicio ahí, <a routerLink="/soy-profesional" class="font-semibold text-brand underline">creá tu perfil</a>.
            </p>
          }
        } @else {
          <a
            [routerLink]="['/profesionales']"
            [queryParams]="{ servicio: s.slug }"
            class="button-primary mt-6 inline-flex h-13 items-center rounded-xl px-5.5 text-[15.5px] font-semibold"
            >Ver profesionales de {{ s.name.toLowerCase() }}</a
          >
          @if (served().length) {
            <h2 class="mt-12 font-display text-2xl font-bold">{{ s.name }} por localidad</h2>
            <ul class="mt-3 flex flex-wrap gap-2">
              @for (l of served(); track l.id) {
                <li>
                  <a
                    [routerLink]="pathFor(s, l)"
                    class="inline-flex min-h-11 items-center rounded-full border border-line bg-surface px-4 text-[15px] font-semibold hover:border-brand hover:text-brand"
                    >{{ l.label }}</a
                  >
                </li>
              }
            </ul>
          }
        }
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
        <p class="mt-3 text-[17px] text-ink-soft">Mirá todos los servicios disponibles en Resuelve.</p>
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
  private readonly localitiesApi = inject(LocalitiesApiService);
  private readonly localityStore = inject(LocalityStore);
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly doc = inject(DOCUMENT);
  private readonly links = inject(PublicLinks);
  private readonly params = toSignal(inject(ActivatedRoute).paramMap, { initialValue: null });
  private readonly slug = computed(() => this.params()?.get('slug') ?? null);
  /** `/ciudades/:province/:locality/...`: provincia y localidad de la URL (null en la página nacional). */
  private readonly placeKey = computed(() => {
    const province = this.params()?.get('province');
    const locality = this.params()?.get('locality');
    return province && locality ? { province, locality } : null;
  });

  /** Localidad real de la URL, con la cantidad de profesionales del servicio ahí. */
  private readonly placeResource = rxResource({
    params: () => {
      const key = this.placeKey();
      const slug = this.slug();
      return key && slug ? { ...key, slug } : undefined;
    },
    stream: ({ params }) =>
      params
        ? this.localitiesApi.getBySlug(params.province, params.locality, params.slug).pipe(
            map((detail): PlaceState => ({ kind: 'ok', detail })),
            catchError(() => of<PlaceState>({ kind: 'missing' })),
          )
        : of<PlaceState>({ kind: 'none' }),
  });
  protected readonly placeState = computed<PlaceState>(() => {
    if (!this.placeKey()) return { kind: 'none' };
    return this.placeResource.hasValue() ? this.placeResource.value() : { kind: 'loading' };
  });
  protected readonly place = computed<LandingPlace | null>(() => {
    const state = this.placeState();
    return state.kind === 'ok' ? { name: state.detail.name, slug: state.detail.slug, province: state.detail.province } : null;
  });
  protected readonly placeCount = computed(() => {
    const state = this.placeState();
    return state.kind === 'ok' ? (state.detail.serviceProfessionalsCount ?? 0) : 0;
  });

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
  // En una localidad, solo quienes la cubren (el backend filtra); en la nacional, los de cualquier ciudad.
  private readonly professionalsResource = rxResource({
    params: () => {
      const slug = this.service()?.slug;
      const state = this.placeState();
      if (!slug || state.kind === 'loading' || state.kind === 'missing') return undefined;
      return { slug, locality: state.kind === 'ok' ? state.detail.id : undefined };
    },
    stream: ({ params }) =>
      params
        ? this.api
            .getProfessionals({ service: params.slug, locality: params.locality, pageSize: LANDING_PROFESSIONALS_LIMIT })
            .pipe(map((page) => landingProfessionals(page.items)))
        : of([]),
  });
  protected readonly professionals = computed(() => (this.professionalsResource.hasValue() ? this.professionalsResource.value() : []));

  /** Página nacional: localidades con profesionales reales de este servicio (enlaces a sus páginas). */
  private readonly servedResource = rxResource({
    params: () => (this.placeKey() ? undefined : this.service()?.slug),
    stream: ({ params: slug }) => (slug ? this.localitiesApi.served(slug).pipe(catchError(() => of([]))) : of([])),
  });
  protected readonly served = computed<ServedLocality[]>(() =>
    this.servedResource.hasValue() ? this.servedResource.value().slice(0, 60) : [],
  );

  protected copyFor = landingCopy;
  protected rating = ratingText;
  protected pathFor(service: LandingService, place: LandingPlace): string {
    return landingPath(service, place);
  }

  constructor() {
    this.catalog.loadCatalog();
    effect(() => {
      const s = this.service();
      const state = this.placeState();
      if (state.kind === 'missing') {
        this.title.setTitle('Localidad no encontrada · Resuelve');
        this.meta.updateTag({ name: 'robots', content: 'noindex, nofollow' });
        this.setCanonical(null);
      } else if (s && state.kind !== 'loading') {
        const place = this.place();
        const copy = landingCopy(s, place);
        this.title.setTitle(copy.title);
        this.meta.updateTag({ name: 'description', content: copy.description });
        this.meta.updateTag({ property: 'og:title', content: copy.title });
        this.meta.updateTag({ property: 'og:description', content: copy.description });
        // Una localidad sin profesionales del servicio no se indexa (nunca miles de páginas vacías).
        if (landingIndexable(place, this.placeCount())) {
          this.meta.removeTag("name='robots'");
          this.setCanonical(`${this.links.origin}${landingPath(s, place)}`);
        } else {
          this.meta.updateTag({ name: 'robots', content: 'noindex, follow' });
          this.setCanonical(null);
        }
      } else if (this.catalog.loaded() && !s) {
        this.title.setTitle('Servicio no encontrado · Resuelve');
        this.meta.updateTag({ name: 'robots', content: 'noindex, nofollow' });
      }
    });
    // Abrir la página de una ciudad la sugiere como ciudad de búsqueda (si todavía no eligió ninguna).
    effect(() => {
      const state = this.placeState();
      if (state.kind === 'ok') {
        const ref = toLocalityRef(state.detail);
        if (ref) this.localityStore.suggest(ref);
      }
    });
  }

  private setCanonical(href: string | null): void {
    const existing = this.doc.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!href) {
      existing?.remove();
      return;
    }
    const link = existing ?? this.doc.createElement('link');
    link.rel = 'canonical';
    link.href = href;
    if (!link.parentNode) this.doc.head.appendChild(link);
  }
}
