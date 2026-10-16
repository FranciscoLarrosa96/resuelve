import { ServiceSpecialtiesEditor } from '../../../shared/components/service-specialties/service-specialties';
import { ServiceSuggestionsApi } from '../../../core/api/service-suggestions-api.service';
import { ServiceSuggestions } from '../../../shared/components/service-suggestions/service-suggestions';
import { ServiceSpecialties } from '../../../core/models/pro-profile';
import { searchServices } from '../../../core/utils/catalog-search';
import {
  CoverageDraft,
  CoverageEditor,
  coverageIssue,
  coveragePayload,
} from '../../../shared/components/coverage-editor/coverage-editor';
import { afterNextRender, ChangeDetectionStrategy, Component, computed, ElementRef, inject, Injector, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom, forkJoin } from 'rxjs';
import { classifyError } from '../../../core/api/api-error';
import { CatalogApiService } from '../../../core/api/catalog-api.service';
import { ProProfileApiService } from '../../../core/api/pro-profile-api.service';
import { Category } from '../../../core/models/category';
import { toLocalityRef } from '../../../core/models/locality';
import { AuthStore } from '../../../core/state/auth.store';
import { Icon } from '../../../shared/components/icon/icon';
import { ContactChannelsForm } from '../profile/contact-channels-form';
import { WELCOME_STATE } from '../../../core/auth/auth.guard';

interface Draft {
  specialties?: ServiceSpecialties[];
  savedAt: number;
  step: number;
  serviceIds: string[];
  /** Cobertura multiciudad (localidad + toda la ciudad o barrios). Borradores viejos no la tienen. */
  coverage?: CoverageDraft[];
  primaryLocalityId?: string | null;
  headline: string;
  bio: string;
  yearsExperience: number;
  availableToday: boolean;
}

const DRAFT_TTL = 24 * 60 * 60 * 1000;
const TITLES = ['Tus servicios', 'Dónde trabajás', 'Tu perfil', 'Disponibilidad y requisitos', 'Revisar y publicar'];

@Component({
  selector: 'app-pro-onboarding-page',
  imports: [RouterLink, CoverageEditor, ContactChannelsForm, Icon, ServiceSpecialtiesEditor, ServiceSuggestions],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-3xl px-5 pb-16 pt-8 md:px-8 md:pt-14">
      <a routerLink="/" class="text-sm font-semibold text-brand hover:underline">← Volver a Resuelve</a>

      @if (step() === 6) {
        <section class="mt-10 max-w-2xl" aria-labelledby="onboarding-title" data-testid="onboarding-contact">
          <p class="inline-flex items-center gap-1.5 text-sm font-semibold text-success" role="status">
            <app-icon name="check-circle" [size]="16" />{{ createdPending() ? 'Tu perfil profesional está creado, pendiente de publicación' : 'Tu perfil profesional está publicado' }}
          </p>
          <h1 id="onboarding-title" tabindex="-1" class="mt-3 font-sans text-3xl leading-tight text-ink md:text-4xl">
            ¿Cómo querés recibir clientes?
          </h1>
          <p class="mt-3 text-ink-soft">
            Elegí cómo preferís que las personas se comuniquen con vos. Podés cambiar estas opciones cuando quieras
            desde tu perfil.
          </p>
          <app-contact-channels-form
            class="mt-7"
            idPrefix="ob"
            variant="intro"
            legend="Formas de contacto"
            submitLabel="Guardar y continuar"
            cancelLabel="Configurar más tarde"
            (saved)="channelsDone()"
            (cancelled)="channelsDone()"
          />
        </section>
      } @else if (step() === 7) {
        <!-- Solo si no se pudo actualizar la sesión: sin ella el área profesional no abre. La bienvenida vive en /pro/bienvenida. -->
        <section class="mt-14" aria-live="polite">
          <p class="text-sm font-semibold uppercase tracking-[0.14em] text-brand">Perfil publicado</p>
          <h1 id="onboarding-title" tabindex="-1" class="mt-3 font-sans text-4xl text-ink">Tu perfil profesional está creado</h1>
          <p class="mt-4 text-sm text-danger" role="alert">No pudimos actualizar tu sesión. Reintentá para entrar al panel.</p>
          <button type="button" class="mt-4 min-h-12 rounded-xl border border-line-btn px-5 font-semibold" (click)="retrySession()">Actualizar sesión</button>
        </section>
      } @else {
        <div class="mt-9">
          <p class="text-sm font-semibold text-brand">Paso {{ step() }} de 5</p>
          <h1 class="mt-2 font-sans text-3xl text-ink md:text-4xl" tabindex="-1" id="onboarding-title">{{ titles[step() - 1] }}</h1>
          <div class="mt-5 flex gap-1.5" aria-hidden="true">
            @for (item of titles; track item; let i = $index) {
              <span class="h-1 flex-1 rounded-full" [class]="i < step() ? 'bg-brand' : 'bg-line'"></span>
            }
          </div>
        </div>

        @if (step() === 1) {
          <p class="mt-6 text-ink-soft">¿Qué trabajos hacés? Elegí todos los servicios que realmente ofrecés. Si tu oficio no está en la lista, sugerilo más abajo.</p>
          @if (categories().length) {
            <div class="mt-5">
              <label for="service-search" class="sr-only">Buscar un servicio</label>
              <div class="flex h-12 items-center gap-2.5 rounded-xl field-control px-4 focus-within:border-brand">
                <app-icon name="search" [size]="17" class="shrink-0 text-muted" />
                <input
                  id="service-search"
                  type="search"
                  autocomplete="off"
                  class="h-full min-w-0 flex-1 bg-transparent outline-none"
                  placeholder="Buscar: plomería, pintura, fletes…"
                  [value]="serviceQuery()"
                  (input)="serviceQuery.set($any($event.target).value)"
                />
              </div>
              @if (serviceIds().length) {
                <p class="mt-2 text-sm font-semibold text-brand" aria-live="polite">
                  {{ serviceIds().length === 1 ? '1 servicio elegido' : serviceIds().length + ' servicios elegidos' }}: {{ serviceNames() }}
                </p>
              }
            </div>
          }
          @if (loading()) { <p class="mt-6 text-muted" role="status">Cargando servicios…</p> }
          @if (loadError()) {
            <p class="mt-6 text-danger" role="alert">No pudimos cargar el catálogo. Tus elecciones siguen guardadas.</p>
            <button type="button" class="mt-3 font-semibold text-brand underline" (click)="loadCatalog()">Reintentar</button>
          }
          @if (categories().length && !visibleCategories().length) {
            <p class="mt-6 text-ink-soft" role="status">No encontramos «{{ serviceQuery() }}». Probá con otra palabra o elegí de la lista completa.</p>
          }
          @for (category of visibleCategories(); track category.id) {
            <fieldset class="mt-7 border-t border-line pt-5">
              <legend class="text-lg font-semibold text-ink">{{ category.name }}</legend>
              <div class="mt-3 grid gap-2 sm:grid-cols-2">
                @for (service of category.services; track service.id) {
                  <label class="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 focus-within:border-brand" [class.bg-brand-tint]="serviceIds().includes(service.id)">
                    <input type="checkbox" class="size-4 accent-brand" [checked]="serviceIds().includes(service.id)" (change)="toggleService(service.id)" />
                    <span class="flex-1 font-medium">{{ service.name }}</span>
                    @if (service.requiresLicense) { <span class="text-xs text-accent-ink">Matrícula</span> }
                  </label>
                }
              </div>
            </fieldset>
          }
          @if (categories().length) {
            <app-service-specialties [services]="selectedServices()" [(specialties)]="specialties" (specialtiesChange)="saveDraft()" />
          }
          <app-service-suggestions (selected)="loadCatalog($event)" (pendingChange)="pendingNames.set($event)" />
          @if (pendingOnly()) {
            <p class="mt-4 rounded-xl border border-accent-line bg-accent-soft p-4 text-sm leading-6 text-accent-ink" role="status" data-testid="onboarding-pending-offer">
              <strong class="font-semibold">Podés seguir sin elegir un servicio.</strong>
              Vamos a revisar {{ pendingList() }}. Tu perfil se crea, pero queda <strong class="font-semibold">pendiente de publicación</strong>:
              no aparecés en las búsquedas ni recibís solicitudes de ese oficio hasta que lo aprobemos. Te avisamos dentro de la app.
            </p>
          }
          @if (licensedServices().length) {
            <p class="mt-6 rounded-xl bg-accent-soft p-4 text-sm text-accent-ink">En los servicios marcados podés cargar tu matrícula. Es opcional: aparecés igual, y se muestra como verificada cuando la aprobamos.</p>
          }
        } @else if (step() === 2) {
          @if (loadError()) {
            <p class="mt-6 text-danger" role="alert">No pudimos cargar el catálogo.</p>
            <button type="button" class="mt-3 font-semibold text-brand underline" (click)="loadCatalog()">Reintentar</button>
          }
          <fieldset class="mt-6">
            <legend class="font-semibold text-ink">¿Dónde trabajás?</legend>
            <p class="mt-1 text-sm text-muted">Solo recibís solicitudes de las localidades que elijas.</p>
            <app-coverage-editor class="mt-4" [(coverage)]="coverage" [(primaryId)]="primaryId" (coverageChange)="saveDraft()" (primaryIdChange)="saveDraft()" />
          </fieldset>
        } @else if (step() === 3) {
          <p class="mt-6 text-ink-soft">Contale a la gente cómo trabajás. Estos datos se mostrarán en tu perfil público.</p>
          @if (auth.user(); as user) {
            <div class="mt-5 border-y border-line py-4 text-sm text-muted">Tu cuenta: <strong class="text-ink">{{ user.firstName }} {{ user.lastName }}</strong> · {{ user.email }}</div>
            @if (user.phone) { <p class="mt-3 text-sm text-muted">Tu teléfono no se muestra públicamente. Se comparte cuando un cliente elige tu presupuesto.</p> }
          }
          <div class="mt-6 space-y-5">
            <div>
              <label for="pro-headline" class="block font-semibold">Título profesional</label>
              <input id="pro-headline" type="text" maxlength="120" [value]="headline()" (input)="setHeadline($event)" placeholder="Por ejemplo: Plomero matriculado" class="mt-2 w-full rounded-xl field-control px-4 py-3" />
              <p class="mt-1 text-xs text-muted">Describí tu trabajo con claridad. Las matrículas se indican solo cuando estén verificadas.</p>
            </div>
            <div>
              <label for="pro-bio" class="block font-semibold">Sobre vos <span class="font-normal text-muted">(opcional)</span></label>
              <textarea id="pro-bio" rows="5" maxlength="2000" [value]="bio()" (input)="setBio($event)" class="mt-2 w-full rounded-xl field-control px-4 py-3"></textarea>
            </div>
            <div>
              <label for="pro-years" class="block font-semibold">Años de experiencia</label>
              <input id="pro-years" type="number" min="0" max="70" [value]="yearsExperience()" (input)="setYears($event)" class="mt-2 w-32 rounded-xl field-control px-4 py-3" />
            </div>
          </div>
        } @else if (step() === 4) {
          <p class="mt-6 text-ink-soft">
            @if (pendingOnly()) { Tu perfil se va a crear sin publicar hasta que aprobemos tu oficio. } @else { Tu perfil se publicará para recibir solicitudes. }
            También podés indicar si atendés urgencias.
          </p>
          <label class="mt-6 flex cursor-pointer items-start gap-3 border-y border-line py-5">
            <input type="checkbox" class="mt-1 size-4 accent-brand" [checked]="availableToday()" (change)="toggleAvailable()" />
            <span><strong class="block">Atiendo urgencias</strong><span class="mt-1 block text-sm text-muted">Aparecés en Urgencias de tus zonas y te avisamos aunque sea de noche. Queda así hasta que lo apagues desde tu panel.</span></span>
          </label>
          <section class="mt-7" aria-labelledby="verification-title">
            <h2 id="verification-title" class="text-lg font-semibold">Verificaciones</h2>
            @if (licensedServices().length) {
              <p class="mt-2 text-sm text-muted">En {{ licensedNames() }} podés mostrar tu matrícula verificada. Es opcional: tu perfil se publica igual, y el sello aparece cuando la aprobamos.</p>
            } @else {
              <p class="mt-2 text-sm text-muted">No seleccionaste servicios con matrícula.</p>
            }
            @if (licensedServices().length) {
              <p class="mt-2 text-sm text-muted">Si querés, después de publicar enviás la matrícula desde “Mi perfil profesional”.</p>
            }
          </section>
        } @else if (step() === 5) {
          @if (pendingOnly()) {
            <p class="mt-6 rounded-xl border border-accent-line bg-accent-soft p-4 text-ink-soft" data-testid="onboarding-review-pending">
              <strong class="font-semibold text-accent-ink">Tu perfil queda pendiente de publicación.</strong>
              Así se va a ver cuando aprobemos {{ pendingList() }}. Hasta entonces no aparece en búsquedas ni recibe solicitudes. Lo demás ya queda cargado.
            </p>
          } @else {
            <p class="mt-6 text-ink-soft">Así te van a ver los clientes cuando busquen en tu zona. Revisalo antes de publicar.</p>
          }
          <!-- Vista previa con los datos reales del alta (sin reseñas ni fotos: todavía no hay). -->
          <figure class="mt-6 rounded-2xl border border-line bg-surface p-5 shadow-soft" data-testid="onboarding-preview" aria-label="Vista previa de tu perfil">
            <div class="flex items-start gap-4">
              <span class="grid size-16 shrink-0 place-items-center rounded-2xl bg-brand-tint font-display text-[24px] font-bold text-brand" aria-hidden="true">{{ initials() }}</span>
              <div class="min-w-0">
                <p class="font-display text-[22px] leading-tight font-bold text-ink">{{ auth.displayName() }}</p>
                <p class="mt-0.5 text-[15px] text-ink-soft">{{ headline() }}</p>
                <p class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px] text-muted">
                  <span class="inline-flex items-center gap-1"><app-icon name="pin" [size]="13" />{{ coverageSummary() }}</span>
                  @if (yearsExperience() > 0) { <span>{{ yearsExperience() }} {{ yearsExperience() === 1 ? 'año' : 'años' }} de experiencia</span> }
                  @if (availableToday()) { <span class="font-semibold text-success-strong">Atiende urgencias</span> }
                </p>
              </div>
            </div>
            @if (bio().trim()) { <p class="mt-4 line-clamp-3 text-[15px] leading-relaxed text-ink-soft">{{ bio().trim() }}</p> }
            <ul class="mt-4 flex flex-wrap gap-2">
              @for (name of serviceList(); track name) { <li class="rounded-full border border-line-soft bg-canvas px-3 py-1 text-[14px] font-medium">{{ name }}</li> }
              @for (name of pendingNames(); track name) {
                @if (!serviceIds().length) { <li class="rounded-full border border-dashed border-accent-line bg-accent-soft px-3 py-1 text-[14px] font-medium text-accent-ink">{{ name }} · en revisión</li> }
              }
            </ul>
            <figcaption class="mt-4 border-t border-line-soft pt-3 text-[13.5px] leading-snug text-muted">
              Después de publicar podés sumar tu foto y tus trabajos con fotos: es lo que más ayuda a que te elijan.
            </figcaption>
          </figure>
          @for (item of specialties(); track item.serviceId) {
            @if (item.names.length) { <p class="mt-3 break-words text-sm text-ink-soft">Especialidades: {{ item.names.join(' · ') }}</p> }
          }
          <dl class="mt-6 divide-y divide-line border-y border-line">
            <div class="py-4"><dt class="text-sm text-muted">Profesional</dt><dd class="mt-1 font-semibold">{{ auth.displayName() }} · {{ headline() }}</dd></div>
            <div class="py-4"><dt class="text-sm text-muted">Servicios</dt><dd class="mt-1">{{ serviceNames() || (pendingOnly() ? 'Pendiente de revisión: ' + pendingList() : '') }}</dd><dd><button type="button" class="mt-1 text-sm font-semibold text-brand underline" (click)="goTo(1)">Editar servicios</button></dd></div>
            <div class="py-4"><dt class="text-sm text-muted">Dónde trabajás</dt><dd class="mt-1">{{ coverageSummary() }}</dd><dd><button type="button" class="mt-1 text-sm font-semibold text-brand underline" (click)="goTo(2)">Editar cobertura</button></dd></div>
            <div class="py-4"><dt class="text-sm text-muted">Experiencia</dt><dd class="mt-1">{{ yearsExperience() }} {{ yearsExperience() === 1 ? 'año' : 'años' }}</dd><dd><button type="button" class="mt-1 text-sm font-semibold text-brand underline" (click)="goTo(3)">Editar perfil</button></dd></div>
            <div class="py-4"><dt class="text-sm text-muted">Atiendo urgencias</dt><dd class="mt-1">{{ availableToday() ? 'Sí' : 'No' }}</dd><dd><button type="button" class="mt-1 text-sm font-semibold text-brand underline" (click)="goTo(4)">Editar disponibilidad</button></dd></div>
          </dl>
        }

        @if (error()) { <p class="mt-6 rounded-xl bg-danger-soft p-4 text-sm text-danger" role="alert" tabindex="-1">{{ error() }}</p> }
        <!-- En el celular los botones quedan a mano (la lista de servicios es larga). -->
        <div class="sticky bottom-0 z-10 -mx-5 mt-9 flex flex-wrap items-center gap-3 border-t border-line bg-canvas/95 px-5 pt-4 pb-[max(16px,env(safe-area-inset-bottom))] backdrop-blur-sm md:static md:mx-0 md:bg-transparent md:px-0 md:pt-6 md:pb-0 md:backdrop-blur-none">
          <button type="button" class="min-h-12 rounded-xl border border-line-btn px-5 font-semibold text-ink" [disabled]="publishing()" (click)="back()">Atrás</button>
          @if (step() < 5) {
            <button type="button" class="button-primary min-h-12 rounded-xl px-7 font-semibold disabled:opacity-60" [disabled]="loading() || !!loadError()" (click)="next()">Continuar</button>
          } @else {
            <button type="button" class="button-primary min-h-12 rounded-xl px-7 font-semibold disabled:opacity-60" [disabled]="publishing()" [attr.aria-busy]="publishing()" (click)="publish()">{{ publishing() ? 'Creando tu perfil…' : pendingOnly() ? 'Crear perfil (sin publicar)' : 'Publicar perfil' }}</button>
          }
        </div>
      }
    </div>
  `,
})
export class ProOnboardingPage {
  protected readonly auth = inject(AuthStore);
  private readonly catalogApi = inject(CatalogApiService);
  private readonly profileApi = inject(ProProfileApiService);
  private readonly suggestionsApi = inject(ServiceSuggestionsApi);
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  protected readonly titles = TITLES;
  /** 1–5 = pasos del alta; 6 = canales (ya publicado); 7 = error al refrescar. La presentación vive en /trabaja-con-resuelve. */
  protected readonly step = signal(1);
  protected readonly categories = signal<Category[]>([]);
  protected readonly loading = signal(false);
  protected readonly loadError = signal(false);
  protected readonly publishing = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly refreshError = signal(false);
  /** Actualización de la sesión después de publicar (la bienvenida la espera). */
  private session: Promise<void> = Promise.resolve();
  protected readonly serviceIds = signal<string[]>([]);
  /** Oficios sugeridos todavía en revisión: con uno, el alta puede seguir sin elegir ningún servicio. */
  protected readonly pendingNames = signal<string[]>([]);
  /** Sin servicios elegidos pero con un oficio en revisión: el perfil se crea sin publicar. */
  protected readonly pendingOnly = computed(() => !this.serviceIds().length && this.pendingNames().length > 0);
  protected readonly pendingList = computed(() => {
    const names = this.pendingNames().map((n) => `“${n}”`);
    return names.length > 1 ? `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}` : (names[0] ?? '');
  });
  /** El perfil se creó sin publicar (para el paso final). */
  protected readonly createdPending = signal(false);
  protected readonly specialties = signal<ServiceSpecialties[]>([]);
  protected readonly selectedServices = computed(() => this.services().filter((s) => this.serviceIds().includes(s.id)));
  /** Localidades donde trabaja ("toda la ciudad" es una propiedad de cada una, no una zona). */
  protected readonly coverage = signal<CoverageDraft[]>([]);
  protected readonly primaryId = signal<string | null>(null);
  protected readonly headline = signal('');
  protected readonly bio = signal('');
  protected readonly yearsExperience = signal(0);
  protected readonly availableToday = signal(false);
  private readonly services = computed(() => this.categories().flatMap((category) => category.services));
  protected readonly licensedServices = computed(() => this.services().filter((s) => s.requiresLicense && this.serviceIds().includes(s.id)));
  protected readonly licensedNames = computed(() => this.licensedServices().map((s) => s.name).join(' y '));
  /** Búsqueda en el catálogo del paso 1 (sin acentos ni mayúsculas). */
  protected readonly serviceQuery = signal('');
  protected readonly visibleCategories = computed(() => {
    const matched = new Set(searchServices(this.services(), this.categories(), this.serviceQuery()).map((s) => s.id));
    return this.categories().map((c) => ({ ...c, services: c.services.filter((s) => matched.has(s.id)) })).filter((c) => c.services.length);
  });
  protected readonly serviceList = computed(() => this.services().filter((s) => this.serviceIds().includes(s.id)).map((s) => s.name));
  protected readonly initials = computed(() => {
    const u = this.auth.user();
    return u ? `${u.firstName.charAt(0)}${u.lastName.charAt(0)}`.toUpperCase() : '';
  });
  protected readonly serviceNames = computed(() => this.services().filter((s) => this.serviceIds().includes(s.id)).map((s) => s.name).join(' · '));
  protected readonly coverageSummary = computed(() =>
    this.coverage()
      .map((c) => `${c.locality.name}${c.coversEntireCity ? ' (toda la ciudad)' : ` (${c.zoneIds.length} ${c.zoneIds.length === 1 ? 'barrio' : 'barrios'})`}`)
      .join(' · '),
  );

  constructor() {
    afterNextRender(() => {
      this.restoreDraft();
      this.loadCatalog();
      this.loadPending();
    });
  }

  /** Sugerencias en revisión de esta cuenta (también tras recargar la página). Si falla, no cambia nada. */
  private loadPending(): void {
    this.suggestionsApi.mine().subscribe({
      next: (items) => this.pendingNames.set(items.filter((i) => i.status === 'PENDING').map((i) => i.name)),
      error: () => { /* sin la lista, el alta sigue pidiendo un servicio */ },
    });
  }

  protected loadCatalog(selectId?: string): void {
    if (this.loading()) return;
    this.loading.set(true);
    this.loadError.set(false);
    forkJoin({ categories: this.catalogApi.getCategories() }).subscribe({
      next: ({ categories }) => {
        this.categories.set(categories);
        const serviceIds = new Set(categories.flatMap((c) => c.services.map((s) => s.id)));
        this.serviceIds.update((ids) => ids.filter((id) => serviceIds.has(id)));
        if (selectId && serviceIds.has(selectId) && !this.serviceIds().includes(selectId)) {
          if (this.serviceIds().length < 10) this.serviceIds.update((ids) => [...ids, selectId]);
          else this.error.set('Podés elegir hasta 10 servicios.');
        }
        this.specialties.update((items) => items.filter((e) => this.serviceIds().includes(e.serviceId)));
        this.loading.set(false);
        this.saveDraft();
      },
      error: () => { this.loading.set(false); this.loadError.set(true); },
    });
  }

  /** Desde el primer paso, "Atrás" vuelve a la presentación para profesionales. */
  protected back(): void {
    if (this.step() <= 1) {
      void this.router.navigateByUrl('/trabaja-con-resuelve');
      return;
    }
    this.goTo(this.step() - 1);
  }
  protected goTo(step: number): void {
    this.error.set(null);
    this.step.set(step);
    // Después de publicar (6 y 7) no hay borrador: el perfil ya existe.
    if (step <= 5) this.saveDraft();
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>('#onboarding-title')?.focus(), { injector: this.injector });
  }

  protected next(): void {
    if (this.step() === 1 && !this.serviceIds().length && !this.pendingNames().length)
      return this.error.set('Elegí al menos un servicio, o sugerí tu oficio, para continuar.');
    if (this.step() === 2) {
      const issue = coverageIssue(this.coverage(), this.primaryId());
      if (issue) return this.error.set(issue);
    }
    if (this.step() === 3 && (!this.headline().trim() || this.headline().length > 120)) return this.error.set('Escribí un título profesional breve para continuar.');
    if (this.step() === 3 && (!Number.isInteger(this.yearsExperience()) || this.yearsExperience() < 0 || this.yearsExperience() > 70)) return this.error.set('Ingresá entre 0 y 70 años de experiencia.');
    this.goTo(this.step() + 1);
  }

  protected toggleService(id: string): void {
    const ids = this.serviceIds();
    if (!ids.includes(id) && ids.length >= 10) return this.error.set('Podés elegir hasta 10 servicios.');
    this.serviceIds.set(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
    this.specialties.update((items) => items.filter((e) => this.serviceIds().includes(e.serviceId)));
    this.error.set(null);
    this.saveDraft();
  }
  protected toggleAvailable(): void { this.availableToday.update((value) => !value); this.saveDraft(); }
  protected setHeadline(event: Event): void { this.headline.set((event.target as HTMLInputElement).value); this.saveDraft(); }
  protected setBio(event: Event): void { this.bio.set((event.target as HTMLTextAreaElement).value); this.saveDraft(); }
  protected setYears(event: Event): void { this.yearsExperience.set(Number((event.target as HTMLInputElement).value)); this.saveDraft(); }

  protected async publish(): Promise<void> {
    if (this.publishing()) return;
    if ((!this.serviceIds().length && !this.pendingNames().length) || coverageIssue(this.coverage(), this.primaryId()) || !this.headline().trim() || !Number.isInteger(this.yearsExperience()) || this.yearsExperience() < 0 || this.yearsExperience() > 70) {
      this.error.set('Revisá servicios, localidades y datos del perfil antes de publicar.');
      return;
    }
    this.publishing.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.profileApi.createProfile({
        headline: this.headline().trim(),
        bio: this.bio().trim() || undefined,
        yearsExperience: this.yearsExperience(),
        serviceIds: this.serviceIds(),
        ...(this.specialties().length ? { specialties: this.specialties() } : {}),
        ...coveragePayload(this.coverage(), this.primaryId()),
        availableToday: this.availableToday(),
      }));
      this.clearDraft();
      this.createdPending.set(this.pendingOnly());
      // El perfil ya existe: el paso de canales es opcional y se guarda aparte (PATCH /pro/contact).
      this.goTo(6);
      this.session = this.refreshSession();
      await this.session;
    } catch (error) {
      const classified = classifyError(error);
      if (classified.code === 'EMAIL_NOT_VERIFIED') {
        // Cuenta anterior a la verificación de email: se verifica y vuelve acá (el borrador queda guardado).
        await this.router.navigate(['/verificar-email'], { queryParams: { returnUrl: '/soy-profesional' } });
      } else if (classified.code === 'PROFESSIONAL_PROFILE_EXISTS') {
        try { await this.auth.loadMe(); await this.router.navigateByUrl('/pro/dashboard', { replaceUrl: true }); }
        catch { this.error.set('Ya tenés un perfil. No pudimos actualizar tu sesión; ingresá de nuevo.'); }
      } else {
        this.error.set(classified.kind === 'validation'
          ? 'Revisá los datos seleccionados; algún servicio, localidad o barrio podría haber cambiado.'
          : 'No pudimos crear tu perfil. Tus datos siguen guardados en esta pestaña.');
      }
    } finally { this.publishing.set(false); }
  }

  /**
   * Guardó sus canales o eligió "Configurar más tarde" (queda como estaba: solo solicitudes).
   * Con la sesión al día, la bienvenida se muestra ya en el área profesional (modo "Profesional").
   */
  protected async channelsDone(): Promise<void> {
    await this.session;
    if (this.refreshError()) return this.goTo(7);
    await this.openWelcome();
  }

  protected async retrySession(): Promise<void> {
    await this.refreshSession();
    if (!this.refreshError()) await this.openWelcome();
  }

  private async openWelcome(): Promise<void> {
    await this.router.navigateByUrl('/pro/bienvenida', { replaceUrl: true, state: { [WELCOME_STATE]: true } });
  }

  private async refreshSession(): Promise<void> {
    try { await this.auth.loadMe(); this.refreshError.set(false); }
    catch { this.refreshError.set(true); }
  }

  private draftKey(): string | null {
    const id = this.auth.user()?.id;
    return id ? `resuelve:onboarding-pro:${id}` : null;
  }
  protected saveDraft(): void {
    const key = this.draftKey();
    if (!key) return;
    const draft: Draft = {
      specialties: this.specialties(),
      savedAt: Date.now(), step: this.step(), serviceIds: this.serviceIds(), coverage: this.coverage(), primaryLocalityId: this.primaryId(),
      headline: this.headline(), bio: this.bio(), yearsExperience: this.yearsExperience(), availableToday: this.availableToday(),
    };
    try { sessionStorage.setItem(key, JSON.stringify(draft)); } catch { /* almacenamiento no disponible */ }
  }
  private restoreDraft(): void {
    const key = this.draftKey();
    if (!key) return;
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw) return;
      const draft = JSON.parse(raw) as Draft;
      if (!draft || Date.now() - draft.savedAt > DRAFT_TTL) { sessionStorage.removeItem(key); return; }
      this.step.set(Number.isInteger(draft.step) && draft.step >= 1 && draft.step <= 5 ? draft.step : 1);
      this.serviceIds.set(Array.isArray(draft.serviceIds) ? draft.serviceIds.filter((id): id is string => typeof id === 'string') : []);
      this.specialties.set(Array.isArray(draft.specialties) ? draft.specialties.filter((e) => e && typeof e.serviceId === 'string' && Array.isArray(e.names) && e.names.every((n) => typeof n === 'string')) : []);
      // Borradores de antes de multiciudad no tenían localidad: se vuelve a elegir (no se asume una ciudad).
      const coverage = Array.isArray(draft.coverage)
        ? draft.coverage.flatMap((c) => {
            const locality = c && toLocalityRef(c.locality);
            return locality
              ? [{ locality, coversEntireCity: c.coversEntireCity === true, zoneIds: Array.isArray(c.zoneIds) ? c.zoneIds.filter((id): id is string => typeof id === 'string') : [] }]
              : [];
          })
        : [];
      this.coverage.set(coverage);
      this.primaryId.set(coverage.some((c) => c.locality.id === draft.primaryLocalityId) ? draft.primaryLocalityId! : (coverage[0]?.locality.id ?? null));
      this.headline.set(typeof draft.headline === 'string' ? draft.headline : '');
      this.bio.set(typeof draft.bio === 'string' ? draft.bio : '');
      this.yearsExperience.set(Number.isInteger(draft.yearsExperience) ? draft.yearsExperience : 0);
      this.availableToday.set(draft.availableToday === true);
    } catch { /* almacenamiento no disponible o borrador inválido */ }
  }
  private clearDraft(): void {
    const key = this.draftKey();
    if (key) { try { sessionStorage.removeItem(key); } catch { /* almacenamiento no disponible */ } }
  }
}
