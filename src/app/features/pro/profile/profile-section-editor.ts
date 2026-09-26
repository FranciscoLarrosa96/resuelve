import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TYPICAL_JOBS_BY_SERVICE } from '../../../core/data/catalog.data';
import { ZonesStore } from '../../../core/state/zones.store';
import { PRO_PORTFOLIO, VERIFICATION_ROWS } from '../../../core/data/pro.data';
import { ProSettings } from '../../../core/models/pro';
import { ToastService } from '../../../core/services/toast.service';
import { CatalogStore } from '../../../core/state/catalog.store';
import { ProStore } from '../../../core/state/pro.store';
import { Avatar } from '../../../shared/components/avatar/avatar';
import { CatalogError } from '../../../shared/components/catalog-error/catalog-error';
import { ChipDirective } from '../../../shared/directives/chip.directive';

export type ProfileSection = 'perfil' | 'servicios' | 'zonas' | 'verif' | 'portfolio';

export const PROFILE_SECTIONS: { key: ProfileSection; label: string }[] = [
  { key: 'perfil', label: 'Perfil público' },
  { key: 'servicios', label: 'Servicios' },
  { key: 'zonas', label: 'Zonas y horarios' },
  { key: 'verif', label: 'Verificación' },
  { key: 'portfolio', label: 'Portfolio' },
];

/** Formularios de cada sección del perfil profesional (desktop y mobile). */
@Component({
  selector: 'app-profile-section-editor',
  imports: [Avatar, CatalogError, ChipDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let s = store.settings();
    @switch (section()) {
      @case ('perfil') {
        <div class="flex flex-col gap-4.5">
          <div class="flex items-center gap-4">
            <app-avatar [subject]="store.me()" alt="" class="size-20 rounded-2xl text-xl" />
            <div>
              <div class="text-[15px] font-semibold">Foto de perfil</div>
              <div class="mt-0.5 text-[13px] text-muted">Una foto real, de frente y con buena luz. Suma confianza.</div>
              <button type="button" class="mt-2 rounded-lg border border-line-btn bg-white px-3 py-1.75 text-[13px] font-semibold press" (click)="soon('Cambiar foto')">Cambiar foto</button>
            </div>
          </div>
          <div class="grid gap-3.5 sm:grid-cols-2">
            <label class="flex flex-col gap-1.5">
              <span class="text-[13.5px] font-semibold">Nombre</span>
              <input class="h-11.5 rounded-xl border border-line-input px-3.5 text-[15px] font-medium outline-none focus:border-brand" [value]="s.name" (input)="set('name', $event)" />
            </label>
            <label class="flex flex-col gap-1.5">
              <span class="text-[13.5px] font-semibold">Años de experiencia</span>
              <input inputmode="numeric" class="h-11.5 rounded-xl border border-line-input px-3.5 text-[15px] font-medium outline-none focus:border-brand" [value]="s.years" (input)="setYears($event)" />
            </label>
          </div>
          <label class="flex flex-col gap-1.5">
            <span class="text-[13.5px] font-semibold">Título</span>
            <input class="h-11.5 rounded-xl border border-line-input px-3.5 text-[15px] font-medium outline-none focus:border-brand" [value]="s.trade" (input)="set('trade', $event)" />
          </label>
          <label class="flex flex-col gap-1.5">
            <span class="text-[13.5px] font-semibold">Descripción</span>
            <textarea rows="4" class="resize-y rounded-xl border border-line-input px-3.5 py-3 text-[15px] leading-normal outline-none focus:border-brand" [value]="s.description" (input)="set('description', $event)"></textarea>
          </label>
        </div>
      }
      @case ('servicios') {
        <fieldset>
          <legend class="text-[15px] font-semibold">Rubros</legend>
          @if (catalog.loaded()) {
            <div class="mt-2.5 flex flex-wrap gap-2">
              @for (c of catalog.activeServices(); track c.id) {
                <button [appChip]="s.serviceSlugs.includes(c.slug)" class="rounded-full px-3.5 py-2 text-[13.5px]" (click)="store.toggleSetting('serviceSlugs', c.slug)">{{ c.name }}</button>
              }
            </div>
          } @else if (catalog.error()) {
            <div class="mt-2.5"><app-catalog-error [compact]="true" /></div>
          } @else {
            <p class="mt-2.5 text-[13px] text-muted" role="status">Cargando servicios…</p>
          }
        </fieldset>
        <fieldset class="mt-6">
          <legend class="text-[15px] font-semibold">Servicios que ofrecés</legend>
          <div class="mt-2.5 flex flex-wrap gap-2">
            @for (name of services(); track name) {
              <button [appChip]="s.services.includes(name)" class="rounded-full px-3.5 py-2 text-[13.5px]" (click)="store.toggleSetting('services', name)">{{ name }}</button>
            } @empty {
              <p class="text-[13px] text-muted">Elegí al menos un rubro.</p>
            }
          </div>
        </fieldset>
      }
      @case ('zonas') {
        <fieldset>
          <legend class="text-[15px] font-semibold">Zonas de cobertura</legend>
          <p class="mt-0.5 text-[13px] text-muted">Recibís pedidos solo de estos barrios.</p>
          <div class="mt-2.5 flex flex-wrap gap-2">
            @for (z of zones(); track z) {
              <button [appChip]="s.zones.includes(z)" class="rounded-full px-3.5 py-2 text-[13.5px]" (click)="store.toggleSetting('zones', z)">{{ z }}</button>
            }
          </div>
        </fieldset>
        <label class="mt-6 flex flex-col gap-1.5">
          <span class="text-[15px] font-semibold">Horarios de atención</span>
          <input class="h-11.5 rounded-xl border border-line-input px-3.5 text-[15px] font-medium outline-none focus:border-brand" [value]="s.hours" (input)="set('hours', $event)" />
        </label>
      }
      @case ('verif') {
        <h3 class="text-[15px] font-semibold">Estado de verificación</h3>
        <ul class="mt-2.5 flex flex-col">
          @for (v of verification; track v.title) {
            <li class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-line-soft py-3.5 last:border-b-0">
              <div>
                <div class="text-[14.5px] font-semibold">{{ v.title }}</div>
                <div class="mt-0.5 text-[13px] text-muted">{{ v.detail }}</div>
              </div>
              <span class="rounded-full px-2.5 py-1.25 text-xs font-semibold" [class]="v.ok ? 'bg-brand-soft text-brand' : 'bg-accent-soft text-accent-ink'">{{ v.status }}</span>
            </li>
          }
        </ul>
      }
      @case ('portfolio') {
        <h3 class="text-[15px] font-semibold">Portfolio</h3>
        <p class="mt-0.5 text-[13px] text-muted">Fotos de trabajos terminados. Plan Free: hasta 6.</p>
        <div class="mt-3.5 grid grid-cols-2 gap-3 sm:grid-cols-3">
          @for (t of portfolio; track t) {
            <figure>
              <div class="photo-placeholder aspect-[4/3] rounded-xl"></div>
              <figcaption class="mt-1.5 text-[13px] font-medium">{{ t }}</figcaption>
            </figure>
          }
          <button type="button" class="aspect-[4/3] rounded-xl border-[1.5px] border-dashed border-line-dash text-[13.5px] font-semibold text-brand hover:bg-cream" (click)="soon('Subir foto')">+ Subir foto</button>
        </div>
      }
    }
  `,
})
export class ProfileSectionEditor {
  private readonly toast = inject(ToastService);
  protected readonly store = inject(ProStore);

  readonly section = input.required<ProfileSection>();

  protected readonly catalog = inject(CatalogStore);
  private readonly zonesStore = inject(ZonesStore);
  /** Barrios reales (GET /zones). El perfil pro sigue siendo demo: no se guarda nada. */
  protected readonly zones = computed(() => this.zonesStore.zones().map((z) => z.name));

  constructor() {
    this.zonesStore.load();
  }
  protected readonly verification = VERIFICATION_ROWS;
  protected readonly portfolio = PRO_PORTFOLIO;

  protected readonly services = computed(() => [
    ...new Set(this.store.settings().serviceSlugs.flatMap((slug) => TYPICAL_JOBS_BY_SERVICE[slug] ?? [])),
  ]);

  protected set(field: keyof Pick<ProSettings, 'name' | 'trade' | 'description' | 'hours'>, event: Event): void {
    this.store.updateSettings({ [field]: (event.target as HTMLInputElement).value });
  }

  protected setYears(event: Event): void {
    const input = event.target as HTMLInputElement;
    const years = input.value.replace(/\D/g, '').slice(0, 2);
    input.value = years;
    this.store.updateSettings({ years });
  }

  protected soon(action: string): void {
    this.toast.show(`“${action}” estará disponible próximamente`);
  }
}
