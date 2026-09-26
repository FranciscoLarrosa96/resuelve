import { afterNextRender, ChangeDetectionStrategy, Component, computed, ElementRef, inject, Injector, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom, forkJoin } from 'rxjs';
import { classifyError } from '../../../core/api/api-error';
import { CatalogApiService } from '../../../core/api/catalog-api.service';
import { ProProfileApiService } from '../../../core/api/pro-profile-api.service';
import { Category, Zone } from '../../../core/models/category';
import { AuthStore } from '../../../core/state/auth.store';

interface Draft {
  savedAt: number;
  step: number;
  serviceIds: string[];
  zoneIds: string[];
  headline: string;
  bio: string;
  yearsExperience: number;
  availableToday: boolean;
}

const DRAFT_TTL = 24 * 60 * 60 * 1000;
const TITLES = ['Tus servicios', 'Dónde trabajás', 'Tu perfil', 'Disponibilidad y requisitos', 'Revisar y publicar'];

@Component({
  selector: 'app-pro-onboarding-page',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-3xl px-5 pb-16 pt-8 md:px-8 md:pt-14">
      <a routerLink="/" class="text-sm font-semibold text-brand hover:underline">← Volver a Resuelve</a>

      @if (step() === 0) {
        <header class="mt-12 max-w-2xl">
          <p class="text-sm font-semibold uppercase tracking-[0.14em] text-brand">Trabajá con Resuelve</p>
          <h1 class="mt-3 font-display text-4xl leading-tight text-ink md:text-5xl">Armá tu perfil profesional</h1>
          <p class="mt-5 text-lg leading-relaxed text-ink-soft">Elegí los trabajos que hacés y dónde trabajás para que las personas de Tandil puedan encontrarte y enviarte solicitudes.</p>
        </header>
        <ul class="mt-8 space-y-3 text-base text-ink-soft">
          <li>✓ Elegís qué servicios ofrecés.</li>
          <li>✓ Elegís las zonas donde trabajás.</li>
          <li>✓ Cotizás las solicitudes que te interesan.</li>
        </ul>
        <button type="button" class="mt-9 min-h-12 rounded-xl bg-brand px-7 py-3 font-semibold text-white hover:bg-brand-dark" (click)="start()">Crear mi perfil</button>
      } @else if (step() === 6) {
        <section class="mt-14" aria-live="polite">
          <p class="text-sm font-semibold uppercase tracking-[0.14em] text-brand">Perfil publicado</p>
          <h1 class="mt-3 font-display text-4xl text-ink">Tu perfil profesional está listo</h1>
          <p class="mt-4 max-w-xl text-ink-soft">Ya podés recibir solicitudes para los servicios y zonas que elegiste. Las matrículas solo figuran como verificadas después de su aprobación.</p>
          @if (refreshError()) {
            <p class="mt-4 text-sm text-danger" role="alert">El perfil se creó, pero no pudimos actualizar tu sesión. Reintentá para entrar al panel.</p>
            <button type="button" class="mt-4 rounded-xl border border-line-btn px-5 py-3 font-semibold" (click)="refreshSession()">Actualizar sesión</button>
          } @else {
            <div class="mt-8 flex flex-wrap gap-3">
              <a routerLink="/pro/dashboard" class="rounded-xl bg-brand px-6 py-3 font-semibold text-white">Ir al panel profesional</a>
              <a [routerLink]="['/profesional', createdId()]" class="rounded-xl border border-line-btn px-6 py-3 font-semibold text-brand">Ver mi perfil público</a>
            </div>
          }
        </section>
      } @else {
        <div class="mt-9">
          <p class="text-sm font-semibold text-brand">Paso {{ step() }} de 5</p>
          <h1 class="mt-2 font-display text-3xl text-ink md:text-4xl" tabindex="-1" id="onboarding-title">{{ titles[step() - 1] }}</h1>
          <div class="mt-5 flex gap-1.5" aria-hidden="true">
            @for (item of titles; track item; let i = $index) {
              <span class="h-1 flex-1 rounded-full" [class]="i < step() ? 'bg-brand' : 'bg-line'"></span>
            }
          </div>
        </div>

        @if (step() === 1) {
          <p class="mt-6 text-ink-soft">¿Qué trabajos hacés? Elegí todos los servicios que realmente ofrecés.</p>
          @if (loading()) { <p class="mt-6 text-muted" role="status">Cargando servicios y zonas…</p> }
          @if (loadError()) {
            <p class="mt-6 text-danger" role="alert">No pudimos cargar el catálogo. Tus elecciones siguen guardadas.</p>
            <button type="button" class="mt-3 font-semibold text-brand underline" (click)="loadCatalog()">Reintentar</button>
          }
          @for (category of categories(); track category.id) {
            <fieldset class="mt-7 border-t border-line pt-5">
              <legend class="text-lg font-semibold text-ink">{{ category.name }}</legend>
              <div class="mt-3 grid gap-2 sm:grid-cols-2">
                @for (service of category.services; track service.id) {
                  <label class="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-line bg-white px-4 py-3 focus-within:border-brand" [class.bg-brand-tint]="serviceIds().includes(service.id)">
                    <input type="checkbox" class="size-4 accent-brand" [checked]="serviceIds().includes(service.id)" (change)="toggleService(service.id)" />
                    <span class="flex-1 font-medium">{{ service.name }}</span>
                    @if (service.requiresLicense) { <span class="text-xs text-accent-ink">Matrícula</span> }
                  </label>
                }
              </div>
            </fieldset>
          }
          @if (licensedServices().length) {
            <p class="mt-6 rounded-xl bg-accent-soft p-4 text-sm text-accent-ink">Los servicios marcados requieren matrícula. Podés crear tu perfil; la matrícula solo se mostrará como verificada cuando sea aprobada.</p>
          }
        } @else if (step() === 2) {
          <p class="mt-6 text-ink-soft">Elegí los barrios de Tandil a los que normalmente podés ir.</p>
          @if (loading()) { <p class="mt-6 text-muted" role="status">Cargando zonas…</p> }
          @if (loadError()) {
            <p class="mt-6 text-danger" role="alert">No pudimos cargar las zonas.</p>
            <button type="button" class="mt-3 font-semibold text-brand underline" (click)="loadCatalog()">Reintentar</button>
          }
          <fieldset class="mt-6 grid gap-2 sm:grid-cols-2">
            <legend class="sr-only">Zonas donde trabajás</legend>
            @for (zone of zones(); track zone.id) {
              <label class="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-line bg-white px-4 py-3 focus-within:border-brand" [class.bg-brand-tint]="zoneIds().includes(zone.id)">
                <input type="checkbox" class="size-4 accent-brand" [checked]="zoneIds().includes(zone.id)" (change)="toggleZone(zone.id)" />
                <span class="font-medium">{{ zone.name }}</span>
              </label>
            }
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
              <input id="pro-headline" type="text" maxlength="120" [value]="headline()" (input)="setHeadline($event)" placeholder="Por ejemplo: Plomero en Tandil" class="mt-2 w-full rounded-xl border border-line-input bg-white px-4 py-3 outline-none focus:border-brand" />
              <p class="mt-1 text-xs text-muted">Describí tu trabajo con claridad. Las matrículas se indican solo cuando estén verificadas.</p>
            </div>
            <div>
              <label for="pro-bio" class="block font-semibold">Sobre vos <span class="font-normal text-muted">(opcional)</span></label>
              <textarea id="pro-bio" rows="5" maxlength="2000" [value]="bio()" (input)="setBio($event)" class="mt-2 w-full rounded-xl border border-line-input bg-white px-4 py-3 outline-none focus:border-brand"></textarea>
            </div>
            <div>
              <label for="pro-years" class="block font-semibold">Años de experiencia</label>
              <input id="pro-years" type="number" min="0" max="70" [value]="yearsExperience()" (input)="setYears($event)" class="mt-2 w-32 rounded-xl border border-line-input bg-white px-4 py-3 outline-none focus:border-brand" />
            </div>
          </div>
        } @else if (step() === 4) {
          <p class="mt-6 text-ink-soft">Tu perfil se publicará para recibir solicitudes. También podés indicar si estás disponible hoy.</p>
          <label class="mt-6 flex cursor-pointer items-start gap-3 border-y border-line py-5">
            <input type="checkbox" class="mt-1 size-4 accent-brand" [checked]="availableToday()" (change)="toggleAvailable()" />
            <span><strong class="block">Disponible hoy</strong><span class="mt-1 block text-sm text-muted">Podemos mostrarte entre quienes atienden hoy. Esta indicación vence a medianoche.</span></span>
          </label>
          <section class="mt-7" aria-labelledby="verification-title">
            <h2 id="verification-title" class="text-lg font-semibold">Verificaciones</h2>
            @if (licensedServices().length) {
              <p class="mt-2 text-sm text-muted">{{ licensedNames() }} requiere{{ licensedServices().length === 1 ? '' : 'n' }} matrícula. Tu perfil podrá publicarse, pero no aparecerás como matriculado hasta que la verificación sea aprobada.</p>
            } @else {
              <p class="mt-2 text-sm text-muted">No seleccionaste servicios marcados con requisito de matrícula.</p>
            }
            <p class="mt-2 text-sm text-muted">La carga y revisión de documentación todavía no están disponibles desde esta pantalla.</p>
          </section>
        } @else if (step() === 5) {
          <p class="mt-6 text-ink-soft">Revisá tus datos antes de publicar. El perfil aparecerá en las búsquedas públicas.</p>
          <dl class="mt-6 divide-y divide-line border-y border-line">
            <div class="py-4"><dt class="text-sm text-muted">Profesional</dt><dd class="mt-1 font-semibold">{{ auth.displayName() }} · {{ headline() }}</dd></div>
            <div class="py-4"><dt class="text-sm text-muted">Servicios</dt><dd class="mt-1">{{ serviceNames() }}</dd><dd><button type="button" class="mt-1 text-sm font-semibold text-brand underline" (click)="goTo(1)">Editar servicios</button></dd></div>
            <div class="py-4"><dt class="text-sm text-muted">Zonas</dt><dd class="mt-1">{{ zoneNames() }}</dd><dd><button type="button" class="mt-1 text-sm font-semibold text-brand underline" (click)="goTo(2)">Editar zonas</button></dd></div>
            <div class="py-4"><dt class="text-sm text-muted">Experiencia</dt><dd class="mt-1">{{ yearsExperience() }} años</dd><dd><button type="button" class="mt-1 text-sm font-semibold text-brand underline" (click)="goTo(3)">Editar perfil</button></dd></div>
            <div class="py-4"><dt class="text-sm text-muted">Disponible hoy</dt><dd class="mt-1">{{ availableToday() ? 'Sí' : 'No' }}</dd><dd><button type="button" class="mt-1 text-sm font-semibold text-brand underline" (click)="goTo(4)">Editar disponibilidad</button></dd></div>
          </dl>
        }

        @if (error()) { <p class="mt-6 rounded-xl bg-danger-soft p-4 text-sm text-danger" role="alert" tabindex="-1">{{ error() }}</p> }
        <div class="mt-9 flex flex-wrap items-center gap-3 border-t border-line pt-6">
          <button type="button" class="min-h-12 rounded-xl border border-line-btn px-5 font-semibold text-ink" [disabled]="publishing()" (click)="back()">Atrás</button>
          @if (step() < 5) {
            <button type="button" class="min-h-12 rounded-xl bg-brand px-7 font-semibold text-white disabled:opacity-60" [disabled]="loading() || !!loadError()" (click)="next()">Continuar</button>
          } @else {
            <button type="button" class="min-h-12 rounded-xl bg-brand px-7 font-semibold text-white disabled:opacity-60" [disabled]="publishing()" [attr.aria-busy]="publishing()" (click)="publish()">{{ publishing() ? 'Creando tu perfil…' : 'Publicar perfil' }}</button>
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
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  protected readonly titles = TITLES;
  protected readonly step = signal(0);
  protected readonly categories = signal<Category[]>([]);
  protected readonly zones = signal<Zone[]>([]);
  protected readonly loading = signal(false);
  protected readonly loadError = signal(false);
  protected readonly publishing = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly refreshError = signal(false);
  protected readonly createdId = signal<string | null>(null);
  protected readonly serviceIds = signal<string[]>([]);
  protected readonly zoneIds = signal<string[]>([]);
  protected readonly headline = signal('');
  protected readonly bio = signal('');
  protected readonly yearsExperience = signal(0);
  protected readonly availableToday = signal(false);

  private readonly services = computed(() => this.categories().flatMap((category) => category.services));
  protected readonly licensedServices = computed(() => this.services().filter((s) => s.requiresLicense && this.serviceIds().includes(s.id)));
  protected readonly licensedNames = computed(() => this.licensedServices().map((s) => s.name).join(' y '));
  protected readonly serviceNames = computed(() => this.services().filter((s) => this.serviceIds().includes(s.id)).map((s) => s.name).join(' · '));
  protected readonly zoneNames = computed(() => this.zones().filter((z) => this.zoneIds().includes(z.id)).map((z) => z.name).join(' · '));

  constructor() {
    afterNextRender(() => {
      this.restoreDraft();
      this.loadCatalog();
    });
  }

  protected loadCatalog(): void {
    if (this.loading()) return;
    this.loading.set(true);
    this.loadError.set(false);
    forkJoin({ categories: this.catalogApi.getCategories(), zones: this.catalogApi.getZones('tandil') }).subscribe({
      next: ({ categories, zones }) => {
        this.categories.set(categories);
        this.zones.set(zones);
        const serviceIds = new Set(categories.flatMap((c) => c.services.map((s) => s.id)));
        const zoneIds = new Set(zones.map((z) => z.id));
        this.serviceIds.update((ids) => ids.filter((id) => serviceIds.has(id)));
        this.zoneIds.update((ids) => ids.filter((id) => zoneIds.has(id)));
        this.loading.set(false);
        this.saveDraft();
      },
      error: () => { this.loading.set(false); this.loadError.set(true); },
    });
  }

  protected start(): void { this.goTo(1); }
  protected back(): void { this.goTo(Math.max(0, this.step() - 1)); }
  protected goTo(step: number): void {
    this.error.set(null);
    this.step.set(step);
    this.saveDraft();
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>('#onboarding-title')?.focus(), { injector: this.injector });
  }

  protected next(): void {
    if (this.step() === 1 && !this.serviceIds().length) return this.error.set('Elegí al menos un servicio para continuar.');
    if (this.step() === 2 && !this.zoneIds().length) return this.error.set('Elegí al menos una zona donde trabajes.');
    if (this.step() === 3 && (!this.headline().trim() || this.headline().length > 120)) return this.error.set('Escribí un título profesional breve para continuar.');
    if (this.step() === 3 && (!Number.isInteger(this.yearsExperience()) || this.yearsExperience() < 0 || this.yearsExperience() > 70)) return this.error.set('Ingresá entre 0 y 70 años de experiencia.');
    this.goTo(this.step() + 1);
  }

  protected toggleService(id: string): void {
    const ids = this.serviceIds();
    if (!ids.includes(id) && ids.length >= 10) return this.error.set('Podés elegir hasta 10 servicios.');
    this.serviceIds.set(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
    this.error.set(null);
    this.saveDraft();
  }
  protected toggleZone(id: string): void {
    const ids = this.zoneIds();
    if (!ids.includes(id) && ids.length >= 30) return this.error.set('Podés elegir hasta 30 zonas.');
    this.zoneIds.set(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
    this.error.set(null);
    this.saveDraft();
  }
  protected toggleAvailable(): void { this.availableToday.update((value) => !value); this.saveDraft(); }
  protected setHeadline(event: Event): void { this.headline.set((event.target as HTMLInputElement).value); this.saveDraft(); }
  protected setBio(event: Event): void { this.bio.set((event.target as HTMLTextAreaElement).value); this.saveDraft(); }
  protected setYears(event: Event): void { this.yearsExperience.set(Number((event.target as HTMLInputElement).value)); this.saveDraft(); }

  protected async publish(): Promise<void> {
    if (this.publishing()) return;
    if (!this.serviceIds().length || !this.zoneIds().length || !this.headline().trim() || !Number.isInteger(this.yearsExperience()) || this.yearsExperience() < 0 || this.yearsExperience() > 70) {
      this.error.set('Revisá servicios, zonas y datos del perfil antes de publicar.');
      return;
    }
    this.publishing.set(true);
    this.error.set(null);
    try {
      const profile = await firstValueFrom(this.profileApi.createProfile({
        headline: this.headline().trim(),
        bio: this.bio().trim() || undefined,
        yearsExperience: this.yearsExperience(),
        serviceIds: this.serviceIds(),
        zoneIds: this.zoneIds(),
        availableToday: this.availableToday(),
      }));
      this.createdId.set(profile.id);
      this.clearDraft();
      this.step.set(6);
      await this.refreshSession();
    } catch (error) {
      const classified = classifyError(error);
      if (classified.code === 'PROFESSIONAL_PROFILE_EXISTS') {
        try { await this.auth.loadMe(); await this.router.navigateByUrl('/pro/dashboard', { replaceUrl: true }); }
        catch { this.error.set('Ya tenés un perfil. No pudimos actualizar tu sesión; ingresá de nuevo.'); }
      } else {
        this.error.set(classified.kind === 'validation'
          ? 'Revisá los datos seleccionados; algún servicio o zona podría haber cambiado.'
          : 'No pudimos crear tu perfil. Tus datos siguen guardados en esta pestaña.');
      }
    } finally { this.publishing.set(false); }
  }

  protected async refreshSession(): Promise<void> {
    try { await this.auth.loadMe(); this.refreshError.set(false); }
    catch { this.refreshError.set(true); }
  }

  private draftKey(): string | null {
    const id = this.auth.user()?.id;
    return id ? `resuelve:onboarding-pro:${id}` : null;
  }
  private saveDraft(): void {
    const key = this.draftKey();
    if (!key) return;
    const draft: Draft = {
      savedAt: Date.now(), step: this.step(), serviceIds: this.serviceIds(), zoneIds: this.zoneIds(),
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
      this.step.set(Number.isInteger(draft.step) && draft.step >= 0 && draft.step <= 5 ? draft.step : 0);
      this.serviceIds.set(Array.isArray(draft.serviceIds) ? draft.serviceIds.filter((id): id is string => typeof id === 'string') : []);
      this.zoneIds.set(Array.isArray(draft.zoneIds) ? draft.zoneIds.filter((id): id is string => typeof id === 'string') : []);
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
