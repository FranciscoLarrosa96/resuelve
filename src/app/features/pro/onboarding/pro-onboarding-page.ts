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
import { afterNextRender, ChangeDetectionStrategy, Component, computed, DestroyRef, ElementRef, inject, Injector, signal } from '@angular/core';
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
import { WelcomeTicket } from '../../../core/auth/welcome-ticket';
import { ActivationSession } from '../activation-session';
import { applyHeadlineSuggestion } from './headline-suggestion';
import { draftKey, hasContent, OnboardingDraft, OnboardingDraftStore, WIZARD_LAST_STEP } from './onboarding-draft';

const TITLES = ['Tus servicios', 'Dónde trabajás', 'Tu perfil', 'Revisar y publicar'];
/** Después del último paso del alta: ya publicado o creado sin publicar. */
const STEP_CONTACT = WIZARD_LAST_STEP + 1;
const STEP_SESSION_ERROR = WIZARD_LAST_STEP + 2;

@Component({
  selector: 'app-pro-onboarding-page',
  imports: [RouterLink, CoverageEditor, ContactChannelsForm, Icon, ServiceSpecialtiesEditor, ServiceSuggestions],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-3xl px-5 pb-16 pt-8 md:px-8 md:pt-14">
      <a routerLink="/" class="text-sm font-semibold text-brand hover:underline">← Volver a Resuelve</a>

      @if (step() === stepContact) {
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
            (cancelled)="channelsDone(true)"
          />
        </section>
      } @else if (step() === stepSessionError) {
        <!-- Solo si no se pudo actualizar la sesión: sin ella el área profesional no abre. La bienvenida vive en /pro/bienvenida. -->
        <section class="mt-14" aria-live="polite">
          <p class="text-sm font-semibold uppercase tracking-[0.14em] text-brand">Perfil publicado</p>
          <h1 id="onboarding-title" tabindex="-1" class="mt-3 font-sans text-4xl text-ink">Tu perfil profesional está creado</h1>
          <p class="mt-4 text-sm text-danger" role="alert">No pudimos actualizar tu sesión. Reintentá para entrar al panel.</p>
          <button type="button" class="mt-4 min-h-12 rounded-xl border border-line-btn px-5 font-semibold" (click)="retrySession()">Actualizar sesión</button>
        </section>
      } @else {
        <div class="mt-9">
          <p class="text-sm font-semibold text-brand">Paso {{ step() }} de {{ titles.length }}</p>
          <h1 class="mt-2 font-sans text-3xl text-ink md:text-4xl" tabindex="-1" id="onboarding-title">{{ titles[step() - 1] }}</h1>
          <div class="mt-5 flex gap-1.5" aria-hidden="true">
            @for (item of titles; track item; let i = $index) {
              <span class="h-1 flex-1 rounded-full" [class]="i < step() ? 'bg-brand' : 'bg-line'"></span>
            }
          </div>
        </div>

        @if (draftConflict()) {
          <div class="mt-5 rounded-xl border border-accent-line bg-accent-soft p-4 text-sm leading-6 text-accent-ink" role="alert" data-testid="draft-conflict">
            <p><strong class="font-semibold">Hay cambios más recientes del alta en otra pestaña.</strong> No los pisamos mientras no elijas.</p>
            <div class="mt-3 flex flex-wrap gap-2">
              <button type="button" class="button-primary min-h-11 rounded-xl px-4 font-semibold" (click)="useNewerDraft()">Usar lo más reciente</button>
              <button type="button" class="min-h-11 rounded-xl border border-line-btn px-4 font-semibold text-ink" (click)="keepThisTab()">Seguir con esta pestaña</button>
            </div>
          </div>
        } @else if (restored()) {
          <p class="mt-5 text-sm leading-6 text-ink-soft" role="status" data-testid="draft-restored">
            Retomamos lo que habías cargado.
            <button type="button" class="min-h-11 font-semibold text-brand underline underline-offset-2" (click)="discardDraft()">Empezar de nuevo</button>
          </p>
        }

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
          <app-service-suggestions [onboarding]="true" (continueRegistration)="continueWithSuggestion($event)" (selected)="loadCatalog($event)" (pendingChange)="pendingNames.set($event)" />
          @if (pendingOnly()) {
            <p class="mt-4 rounded-xl border border-accent-line bg-accent-soft p-4 text-sm leading-6 text-accent-ink" role="status" data-testid="onboarding-pending-offer">
              <strong class="font-semibold">Podés seguir sin elegir un servicio.</strong>
              Vamos a revisar {{ pendingList() }}. Tu perfil se crea, pero queda <strong class="font-semibold">pendiente de publicación</strong>:
              no aparecés en las búsquedas ni recibís solicitudes de ese oficio hasta que lo aprobemos y el perfil cumpla las demás condiciones
              (estar activo y tener dónde trabajás cargado). Te avisamos dentro de la app.
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
            <legend class="sr-only">¿Dónde trabajás?</legend>
            <p class="text-sm text-muted">Solo recibís solicitudes de las localidades que elijas.</p>
            <app-coverage-editor class="mt-4" [(coverage)]="coverage" [(primaryId)]="primaryId" (coverageChange)="saveDraft()" (primaryIdChange)="saveDraft()" />
          </fieldset>
        } @else if (step() === 3) {
          <p class="mt-6 text-ink-soft">Contale a la gente cómo trabajás. Se muestra en tu perfil público; solo el título es obligatorio.</p>
          @if (auth.user(); as user) {
            <p class="mt-5 border-y border-line py-4 text-sm text-muted">
              Te mostramos como <strong class="text-ink">{{ user.firstName }} {{ user.lastName }}</strong>, el nombre de tu cuenta.
              @if (user.phone) { Tu teléfono no se muestra públicamente: se comparte cuando un cliente elige tu presupuesto. }
            </p>
          }
          <div class="mt-6 space-y-5">
            <div>
              <label for="pro-headline" class="block font-semibold">Título profesional <span class="font-normal text-muted">(obligatorio)</span></label>
              <input id="pro-headline" type="text" maxlength="120" [value]="headline()" (input)="setHeadline($event)" [placeholder]="headlinePlaceholder()" aria-describedby="pro-headline-hint" [attr.aria-invalid]="headlineInvalid() ? 'true' : null" class="mt-2 w-full rounded-xl field-control px-4 py-3" />
              <p id="pro-headline-hint" class="mt-1 text-xs text-muted">
                @if (headlineIsSuggested()) { Lo completamos con tu primer oficio: cambialo por lo que mejor te describa, por ejemplo «Plomero matriculado». }
                @else { Describí tu trabajo con claridad. Las matrículas se indican solo cuando estén verificadas. }
              </p>
            </div>
            <div>
              <label for="pro-bio" class="block font-semibold">Sobre vos <span class="font-normal text-muted">(opcional)</span></label>
              <textarea id="pro-bio" rows="5" maxlength="2000" [value]="bio()" (input)="setBio($event)" class="mt-2 w-full rounded-xl field-control px-4 py-3"></textarea>
            </div>
            <div>
              <label for="pro-years" class="block font-semibold">Años de experiencia <span class="font-normal text-muted">(opcional)</span></label>
              <input id="pro-years" type="number" min="0" max="70" inputmode="numeric" [value]="yearsExperience() ?? ''" (input)="setYears($event)" [attr.aria-invalid]="yearsInvalid() ? 'true' : null" class="mt-2 w-32 rounded-xl field-control px-4 py-3" />
            </div>
          </div>
        } @else if (step() === 4) {
          @if (pendingOnly()) {
            <p class="mt-6 rounded-xl border border-accent-line bg-accent-soft p-4 text-ink-soft" data-testid="onboarding-review-pending">
              <strong class="font-semibold text-accent-ink">Tu perfil queda pendiente de publicación.</strong>
              Así se va a ver cuando aprobemos {{ pendingList() }} y el perfil cumpla las demás condiciones (estar activo y tener dónde trabajás cargado).
              Hasta entonces no aparece en búsquedas ni recibe solicitudes. Lo demás ya queda cargado.
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
                  @if ((yearsExperience() ?? 0) > 0) { <span>{{ yearsExperience() }} {{ yearsExperience() === 1 ? 'año' : 'años' }} de experiencia</span> }
                  @if (availableToday()) { <span class="font-semibold text-success-strong">Atiende urgencias</span> }
                </p>
              </div>
            </div>
            @if (bio().trim()) { <p class="mt-4 line-clamp-3 text-[15px] leading-relaxed text-ink-soft">{{ bio().trim() }}</p> }
            @for (item of specialties(); track item.serviceId) {
              @if (item.names.length) { <p class="mt-3 break-words text-sm text-ink-soft">Especialidades: {{ item.names.join(' · ') }}</p> }
            }
            <ul class="mt-4 flex flex-wrap gap-2">
              @for (name of serviceList(); track name) { <li class="rounded-full border border-line-soft bg-canvas px-3 py-1 text-[14px] font-medium">{{ name }}</li> }
              @for (name of pendingNames(); track name) {
                @if (!serviceIds().length) { <li class="rounded-full border border-dashed border-accent-line bg-accent-soft px-3 py-1 text-[14px] font-medium text-accent-ink">{{ name }} · en revisión</li> }
              }
            </ul>
            <figcaption class="mt-4 border-t border-line-soft pt-3 text-[13.5px] leading-snug text-muted">
              Después de publicar podés sumar tu foto y tus trabajos: es opcional y desde el panel.
            </figcaption>
          </figure>
          <p class="mt-4 flex flex-wrap gap-x-5">
            <button type="button" class="min-h-11 text-sm font-semibold text-brand underline underline-offset-2" (click)="goTo(1)">Editar servicios</button>
            <button type="button" class="min-h-11 text-sm font-semibold text-brand underline underline-offset-2" (click)="goTo(2)">Editar dónde trabajás</button>
            <button type="button" class="min-h-11 text-sm font-semibold text-brand underline underline-offset-2" (click)="goTo(3)">Editar título y presentación</button>
          </p>
        }

        @if (error()) { <p id="onboarding-error" class="mt-6 rounded-xl bg-danger-soft p-4 text-sm text-danger" role="alert" tabindex="-1">{{ error() }}</p> }
        @if (draftUnavailable()) { <p class="mt-4 text-xs text-muted" role="status">En este navegador no podemos guardar lo que cargás: si salís o recargás, vas a empezar de nuevo.</p> }
        <!-- En el celular los botones quedan a mano (la lista de servicios es larga). -->
        <div class="sticky bottom-0 z-10 -mx-5 mt-9 flex flex-wrap items-center gap-3 border-t border-line bg-canvas/95 px-5 pt-4 pb-[max(16px,env(safe-area-inset-bottom))] backdrop-blur-sm md:static md:mx-0 md:bg-transparent md:px-0 md:pt-6 md:pb-0 md:backdrop-blur-none">
          <button type="button" class="min-h-12 rounded-xl border border-line-btn px-5 font-semibold text-ink" [disabled]="publishing()" (click)="back()">Atrás</button>
          @if (step() < lastStep) {
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
  private readonly destroyRef = inject(DestroyRef);
  private readonly welcome = inject(WelcomeTicket);
  private readonly activation = inject(ActivationSession);
  private readonly drafts = new OnboardingDraftStore();

  protected readonly titles = TITLES;
  protected readonly lastStep = WIZARD_LAST_STEP;
  protected readonly stepContact = STEP_CONTACT;
  protected readonly stepSessionError = STEP_SESSION_ERROR;
  /** 1–4 = pasos del alta; 5 = canales (ya creado); 6 = error al refrescar. La presentación vive en /trabaja-con-resuelve. */
  protected readonly step = signal(1);
  protected readonly categories = signal<Category[]>([]);
  protected readonly loading = signal(false);
  protected readonly loadError = signal(false);
  protected readonly publishing = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly refreshError = signal(false);
  /** Se retomó un borrador guardado (aviso con "Empezar de nuevo"). */
  protected readonly restored = signal(false);
  /** Otra pestaña guardó cambios más nuevos: no se pisan sin que la persona elija. */
  protected readonly draftConflict = signal(false);
  protected readonly draftUnavailable = signal(false);
  /** Actualización de la sesión después de crear el perfil (la bienvenida la espera). */
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
  /** La persona escribió o borró el título: nunca se vuelve a completar solo. */
  private readonly headlineEdited = signal(false);
  /** Lo último que puso la sugerencia. */
  private readonly headlineAuto = signal<string | null>(null);
  protected readonly bio = signal('');
  /** null = no informado (campo vacío): no es 0 años. */
  protected readonly yearsExperience = signal<number | null>(null);
  /** Solo de un borrador anterior: el paso de urgencias ya no está en el alta (se configura desde el panel). */
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
  /** Nombre del primer oficio aprobado que eligió (en el orden en que los eligió); sin ninguno, no hay sugerencia. */
  private readonly suggestedHeadline = computed(() => {
    const byId = new Map(this.services().map((s) => [s.id, s.name]));
    for (const id of this.serviceIds()) {
      const name = byId.get(id);
      if (name) return name;
    }
    return null;
  });
  protected readonly headlineIsSuggested = computed(() => !this.headlineEdited() && this.headline() !== '' && this.headline() === this.headlineAuto());
  protected readonly headlinePlaceholder = computed(() =>
    this.pendingOnly() ? `Por ejemplo: ${this.pendingNames()[0] ?? 'tu oficio'}` : 'Por ejemplo: Plomero matriculado',
  );
  protected readonly headlineInvalid = computed(() => !!this.error() && this.step() === 3 && (!this.headline().trim() || this.headline().length > 120));
  protected readonly yearsInvalid = computed(() => !!this.error() && this.step() === 3 && this.yearsIssue() !== null);

  constructor() {
    afterNextRender(() => {
      this.profileApi.startOnboarding().subscribe({
        next: ({ professionalIntentAt }) => {
          // Mantiene la sesión actual al día sin guardar permisos ni un perfil ficticio.
          if (professionalIntentAt && !this.auth.user()?.professionalIntentAt) void this.auth.loadMe().catch(() => undefined);
        },
        error: () => { /* el alta sigue; el registro profesional ya persiste la intención cuando corresponde */ },
      });
      this.restoreDraft();
      this.loadCatalog();
      this.loadPending();
      // Otra pestaña del mismo navegador guardó el borrador: se avisa sin pisar.
      const onStorage = (event: StorageEvent): void => {
        const id = this.auth.user()?.id;
        if (id && event.key === draftKey(id) && this.step() <= WIZARD_LAST_STEP && this.drafts.hasNewerElsewhere(id)) this.draftConflict.set(true);
      };
      window.addEventListener('storage', onStorage);
      this.destroyRef.onDestroy(() => window.removeEventListener('storage', onStorage));
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
          else this.fail('Podés elegir hasta 10 servicios.');
        }
        this.specialties.update((items) => items.filter((e) => this.serviceIds().includes(e.serviceId)));
        // Retomado directo en el paso del título: ahora que se conocen los oficios, se sugiere el primero.
        if (this.step() === 3) this.suggestHeadline();
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
    this.restored.set(false);
    this.step.set(step);
    if (step === 3) this.suggestHeadline();
    // Después de crear el perfil (5 y 6) no hay borrador: el perfil ya existe.
    if (step <= WIZARD_LAST_STEP) this.saveDraft();
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>('#onboarding-title')?.focus(), { injector: this.injector });
  }

  /** Un error del paso: se muestra y se lleva el foco ahí (lectores de pantalla y teclado). */
  private fail(message: string): void {
    this.error.set(message);
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>('#onboarding-error')?.focus(), { injector: this.injector });
  }

  private yearsIssue(): string | null {
    const years = this.yearsExperience();
    if (years === null) return null;
    return Number.isInteger(years) && years >= 0 && years <= 70 ? null : 'Ingresá entre 0 y 70 años de experiencia, o dejalo vacío.';
  }

  /** Reglas de cada paso (las mismas que valida el backend al crear). */
  private stepIssue(step: number): string | null {
    if (step === 1 && !this.serviceIds().length && !this.pendingNames().length) return 'Elegí al menos un servicio, o sugerí tu oficio, para continuar.';
    if (step === 2) return coverageIssue(this.coverage(), this.primaryId());
    if (step === 3) {
      if (!this.headline().trim() || this.headline().length > 120) return 'Escribí un título profesional breve para continuar.';
      return this.yearsIssue();
    }
    return null;
  }

  protected continueWithSuggestion(names: string[]): void {
    this.pendingNames.set(names);
    this.next();
  }

  protected next(): void {
    const issue = this.stepIssue(this.step());
    if (issue) return this.fail(issue);
    this.goTo(this.step() + 1);
  }

  protected toggleService(id: string): void {
    const ids = this.serviceIds();
    if (!ids.includes(id) && ids.length >= 10) return this.fail('Podés elegir hasta 10 servicios.');
    this.serviceIds.set(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
    this.specialties.update((items) => items.filter((e) => this.serviceIds().includes(e.serviceId)));
    this.error.set(null);
    this.saveDraft();
  }
  protected setHeadline(event: Event): void {
    this.headline.set((event.target as HTMLInputElement).value);
    // Lo que la persona escribe (o borra) es suyo: la sugerencia no vuelve a tocarlo.
    this.headlineEdited.set(true);
    this.headlineAuto.set(null);
    this.saveDraft();
  }
  protected setBio(event: Event): void { this.bio.set((event.target as HTMLTextAreaElement).value); this.saveDraft(); }
  protected setYears(event: Event): void {
    const raw = (event.target as HTMLInputElement).value.trim();
    this.yearsExperience.set(raw === '' ? null : Number(raw));
    this.saveDraft();
  }

  private suggestHeadline(): void {
    const next = applyHeadlineSuggestion(
      { headline: this.headline(), edited: this.headlineEdited(), auto: this.headlineAuto() },
      this.suggestedHeadline(),
    );
    this.headline.set(next.headline);
    this.headlineAuto.set(next.auto);
  }

  protected async publish(): Promise<void> {
    if (this.publishing()) return;
    const issue = [1, 2, 3].map((step) => this.stepIssue(step)).find((x) => x);
    if (issue) {
      this.fail('Revisá servicios, localidades y datos del perfil antes de publicar.');
      return;
    }
    this.publishing.set(true);
    this.error.set(null);
    try {
      const years = this.yearsExperience();
      await firstValueFrom(this.profileApi.createProfile({
        headline: this.headline().trim(),
        bio: this.bio().trim() || undefined,
        ...(years !== null ? { yearsExperience: years } : {}),
        serviceIds: this.serviceIds(),
        ...(this.specialties().length ? { specialties: this.specialties() } : {}),
        ...coveragePayload(this.coverage(), this.primaryId()),
        ...(this.availableToday() ? { availableToday: true } : {}),
      }));
      this.clearDraft();
      this.createdPending.set(this.pendingOnly());
      // El perfil ya existe: el paso de canales es opcional y se guarda aparte (PATCH /pro/contact).
      this.goTo(STEP_CONTACT);
      this.session = this.refreshSession();
      await this.session;
    } catch (error) {
      const classified = classifyError(error);
      if (classified.code === 'EMAIL_NOT_VERIFIED') {
        // Cuenta anterior a la verificación de email: se verifica y vuelve acá (el borrador queda guardado).
        await this.router.navigate(['/verificar-email'], { queryParams: { returnUrl: '/soy-profesional' } });
      } else if (classified.code === 'PROFESSIONAL_PROFILE_EXISTS') {
        try { await this.auth.loadMe(); this.clearDraft(); await this.router.navigateByUrl('/pro/dashboard', { replaceUrl: true }); }
        catch { this.fail('Ya tenés un perfil. No pudimos actualizar tu sesión; ingresá de nuevo.'); }
      } else {
        this.fail(classified.kind === 'validation'
          ? 'Revisá los datos seleccionados; algún servicio, localidad o barrio podría haber cambiado.'
          : 'No pudimos crear tu perfil. Tus datos siguen guardados en este navegador.');
      }
    } finally { this.publishing.set(false); }
  }

  /**
   * Guardó sus canales o eligió "Configurar más tarde" (queda como estaba: solo solicitudes).
   * Con la sesión al día, la bienvenida se muestra ya en el área profesional (modo "Profesional").
   */
  protected async channelsDone(skipped = false): Promise<void> {
    // "Configurar más tarde": el panel no se lo vuelve a proponer enseguida (queda disponible en Mi perfil).
    if (skipped) this.activation.skip(this.auth.user()?.id, 'CONTACT');
    await this.session;
    if (this.refreshError()) return this.goTo(STEP_SESSION_ERROR);
    await this.openWelcome();
  }

  protected async retrySession(): Promise<void> {
    await this.refreshSession();
    if (!this.refreshError()) await this.openWelcome();
  }

  private async openWelcome(): Promise<void> {
    this.welcome.grant();
    await this.router.navigateByUrl('/pro/bienvenida', { replaceUrl: true });
  }

  private async refreshSession(): Promise<void> {
    try { await this.auth.loadMe(); this.refreshError.set(false); }
    catch { this.refreshError.set(true); }
  }

  // ---- Borrador (este navegador, por cuenta, 24 h de inactividad; ver onboarding-draft.ts) ----
  private snapshot(userId: string): Omit<OnboardingDraft, 'v' | 'rev' | 'savedAt'> {
    return {
      userId,
      step: Math.min(this.step(), WIZARD_LAST_STEP),
      serviceIds: this.serviceIds(),
      specialties: this.specialties(),
      coverage: this.coverage(),
      primaryLocalityId: this.primaryId(),
      headline: this.headline(),
      headlineEdited: this.headlineEdited(),
      headlineAuto: this.headlineAuto(),
      bio: this.bio(),
      yearsExperience: this.yearsExperience(),
      availableToday: this.availableToday(),
    };
  }

  protected saveDraft(force = false): void {
    const id = this.auth.user()?.id;
    if (!id || this.step() > WIZARD_LAST_STEP) return;
    const result = this.drafts.save(this.snapshot(id), force);
    this.draftUnavailable.set(result === 'unavailable');
    if (result === 'conflict') this.draftConflict.set(true);
  }

  private applyDraft(draft: OnboardingDraft): void {
    this.step.set(draft.step);
    this.serviceIds.set(draft.serviceIds);
    this.specialties.set(draft.specialties);
    this.coverage.set(draft.coverage);
    this.primaryId.set(draft.primaryLocalityId);
    this.headline.set(draft.headline);
    this.headlineEdited.set(draft.headlineEdited);
    this.headlineAuto.set(draft.headlineAuto);
    this.bio.set(draft.bio);
    this.yearsExperience.set(draft.yearsExperience);
    this.availableToday.set(draft.availableToday);
  }

  private restoreDraft(): void {
    const id = this.auth.user()?.id;
    if (!id) return;
    const draft = this.drafts.load(id);
    if (!draft) return;
    this.applyDraft(draft);
    this.restored.set(hasContent(draft));
  }

  /** Otra pestaña guardó algo más nuevo y se elige usarlo. */
  protected useNewerDraft(): void {
    const id = this.auth.user()?.id;
    const newer = id ? this.drafts.peek(id) : null;
    if (newer) {
      this.drafts.adopt(newer);
      this.applyDraft(newer);
    }
    this.draftConflict.set(false);
  }

  /** Se elige seguir con lo de esta pestaña: recién ahí se pisa lo guardado por la otra. */
  protected keepThisTab(): void {
    this.draftConflict.set(false);
    this.saveDraft(true);
  }

  /** "Empezar de nuevo": borra el borrador y vuelve al paso 1 vacío (los oficios sugeridos en revisión no se tocan). */
  protected discardDraft(): void {
    const id = this.auth.user()?.id;
    if (id) this.drafts.clear(id);
    this.applyDraft({
      v: 2, userId: id ?? '', savedAt: 0, rev: 0, step: 1, serviceIds: [], specialties: [], coverage: [], primaryLocalityId: null,
      headline: '', headlineEdited: false, headlineAuto: null, bio: '', yearsExperience: null, availableToday: false,
    });
    this.restored.set(false);
    this.draftConflict.set(false);
    this.error.set(null);
  }

  private clearDraft(): void {
    const id = this.auth.user()?.id;
    if (id) this.drafts.clear(id);
  }
}
