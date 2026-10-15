import { ChangeDetectionStrategy, Component, afterNextRender, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { classifyError } from '../../../core/api/api-error';
import { ServiceSuggestion, ServiceSuggestionsApi, SuggestionStatus } from '../../../core/api/service-suggestions-api.service';
import { CatalogStore } from '../../../core/state/catalog.store';
import { formatTimestamp } from '../../../core/utils/dates';
import { Dialog } from '../../../shared/components/dialog/dialog';
import { AdminHeader } from '../admin-header';

@Component({
  selector: 'app-admin-services-page',
  imports: [AdminHeader, FormsModule, Dialog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-admin-header current="oficios" />
    <main id="main" class="mx-auto max-w-4xl px-4 pb-16 pt-8 sm:px-6">
      <h1 class="text-3xl font-bold">Oficios sugeridos</h1>
      <p class="mt-2 text-ink-soft">Revisá los oficios que faltan. Podés corregir el nombre y publicarlos, vincularlos con uno existente o rechazarlos con un motivo.</p>
      <div class="mt-6 flex flex-wrap items-end justify-between gap-3">
        <label class="text-sm font-semibold">Ver sugerencias
          <select class="field-control mt-1.5 block min-h-11 rounded-xl px-3" [ngModel]="status()" (ngModelChange)="changeStatus($event)" [disabled]="busy()">
            <option value="PENDING">Pendientes</option><option value="APPROVED">Aprobadas</option><option value="REJECTED">Rechazadas</option>
          </select>
        </label>
        <button type="button" class="min-h-11 font-semibold text-brand underline disabled:opacity-50" [disabled]="loading() || busy()" (click)="load(page())">Actualizar lista</button>
      </div>
      @if (error()) { <p class="mt-4 text-danger" role="alert">{{ error() }}</p> }
      @if (message()) { <p class="mt-4 text-success" role="status">{{ message() }}</p> }
      @if (loading()) { <p class="mt-6 text-muted" role="status">Cargando sugerencias…</p> }
      @else if (ready()) {
        <p class="mt-5 text-sm text-muted">{{ total() }} {{ total() === 1 ? 'sugerencia' : 'sugerencias' }}</p>
        @if (!items().length) { <p class="mt-6 rounded-xl border border-dashed border-line-dash p-6 text-muted">No hay sugerencias en esta vista.</p> }
        <ul class="mt-3 divide-y divide-line">
          @for (item of items(); track item.id) {
            <li class="py-5">
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div class="min-w-0"><h2 class="break-words text-xl font-bold">{{ item.name }}</h2><p class="mt-1 text-sm text-muted">Enviado {{ timestamp(item.createdAt) }}</p></div>
                @if (item.status === 'PENDING') { <button type="button" class="button-primary min-h-11 rounded-xl px-4 font-semibold" (click)="review(item)">Revisar</button> }
              </div>
              @if (item.status === 'APPROVED') { <p class="mt-2 text-sm text-success">Aprobado como {{ item.serviceName }}.</p> }
              @if (item.status === 'REJECTED') { <p class="mt-2 break-words text-sm text-ink-soft">Motivo: {{ item.reason }}</p> }
              @if (item.reviewedAt) { <p class="mt-1 text-sm text-muted">Revisado {{ timestamp(item.reviewedAt) }}</p> }
            </li>
          }
        </ul>
        @if (total() > 25) {
          <nav class="mt-5 flex items-center justify-between gap-3" aria-label="Páginas de sugerencias">
            <button type="button" class="button-secondary min-h-11 rounded-xl px-3 disabled:opacity-50" [disabled]="page() <= 1" (click)="load(page() - 1)">Anterior</button>
            <span class="text-sm">Página {{ page() }}</span>
            <button type="button" class="button-secondary min-h-11 rounded-xl px-3 disabled:opacity-50" [disabled]="page() * 25 >= total()" (click)="load(page() + 1)">Siguiente</button>
          </nav>
        }
      }
    </main>
    <app-dialog [open]="selected() !== null" labelledBy="review-service-title" [dismissable]="!busy()" (dismiss)="close()">
      @if (selected(); as item) {
        <h2 id="review-service-title" class="break-words text-2xl font-bold">Revisar {{ item.name }}</h2>
        <label class="mt-5 block text-sm font-semibold">Qué querés hacer
          <select class="field-control mt-1.5 min-h-12 w-full rounded-xl px-3" [(ngModel)]="mode" [disabled]="busy()">
            <option value="CREATE">Crear un oficio en el catálogo</option><option value="LINK">Usar un oficio existente</option><option value="REJECT">Rechazar sugerencia</option>
          </select>
        </label>
        @if (mode === 'CREATE') {
          <p class="mt-3 text-sm text-muted">El oficio quedará disponible para todos. Su nombre también define el enlace público.</p>
          <label class="mt-4 block text-sm font-semibold">Nombre a publicar<input class="field-control mt-1.5 min-h-12 w-full rounded-xl px-3" maxlength="80" [(ngModel)]="name" [disabled]="busy()" /></label>
          <label class="mt-4 block text-sm font-semibold">Categoría<select class="field-control mt-1.5 min-h-12 w-full rounded-xl px-3" [(ngModel)]="categoryId" [disabled]="busy()"><option value="">Elegí una categoría</option>@for (category of catalog.categories(); track category.id) { <option [value]="category.id">{{ category.name }}</option> }</select></label>
          <label class="mt-4 flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" class="size-4 accent-brand" [(ngModel)]="requiresLicense" [disabled]="busy()" />Permitir verificación de matrícula para este oficio</label>
        } @else if (mode === 'LINK') {
          <p class="mt-3 text-sm text-muted">La sugerencia quedará aprobada con este oficio, sin crear uno duplicado.</p>
          <label class="mt-4 block text-sm font-semibold">Oficio existente<select class="field-control mt-1.5 min-h-12 w-full rounded-xl px-3" [(ngModel)]="serviceId" [disabled]="busy()"><option value="">Elegí un oficio</option>@for (group of catalog.servicesByCategory(); track group.category.id) { <optgroup [label]="group.category.name">@for (service of group.services; track service.id) { <option [value]="service.id">{{ service.name }}</option> }</optgroup> }</select></label>
        } @else {
          <label class="mt-4 block text-sm font-semibold">Motivo para la persona<textarea class="field-control mt-1.5 min-h-24 w-full rounded-xl p-3" maxlength="300" [(ngModel)]="reason" [disabled]="busy()"></textarea></label>
          <p class="mt-2 text-sm text-muted">Explicá brevemente el motivo, sin datos personales ni enlaces.</p>
        }
        @if (mode !== 'REJECT' && catalog.error()) { <p class="mt-3 text-sm text-danger" role="alert">No pudimos cargar el catálogo.</p><button type="button" class="min-h-11 font-semibold text-brand underline" (click)="catalog.refresh()">Reintentar catálogo</button> }
        @if (actionError()) { <p class="mt-4 text-sm text-danger" role="alert">{{ actionError() }}</p> }
        <div class="mt-6 flex flex-wrap justify-end gap-3">
          <button type="button" class="button-secondary min-h-11 rounded-xl px-4 font-semibold disabled:opacity-50" [disabled]="busy()" (click)="close()">Cancelar</button>
          <button type="button" class="button-primary min-h-11 rounded-xl px-4 font-semibold disabled:opacity-50" [disabled]="busy() || (mode !== 'REJECT' && (catalog.loading() || !catalog.loaded() || !!catalog.error()))" (click)="save()">{{ busy() ? 'Guardando…' : mode === 'REJECT' ? 'Rechazar sugerencia' : 'Aprobar oficio' }}</button>
        </div>
      }
    </app-dialog>
  `,
})
export class AdminServicesPage {
  private readonly api = inject(ServiceSuggestionsApi);
  protected readonly catalog = inject(CatalogStore);
  protected readonly status = signal<SuggestionStatus>('PENDING');
  protected readonly page = signal(1);
  protected readonly total = signal(0);
  protected readonly items = signal<ServiceSuggestion[]>([]);
  protected readonly loading = signal(false);
  protected readonly ready = signal(false);
  protected readonly busy = signal(false);
  protected readonly selected = signal<ServiceSuggestion | null>(null);
  protected readonly error = signal('');
  protected readonly actionError = signal('');
  protected readonly message = signal('');
  protected readonly timestamp = formatTimestamp;
  protected mode: 'CREATE' | 'LINK' | 'REJECT' = 'CREATE';
  protected name = '';
  protected categoryId = '';
  protected serviceId = '';
  protected requiresLicense = false;
  protected reason = '';
  private sequence = 0;

  constructor() { afterNextRender(() => { this.catalog.loadCatalog(); void this.load(); }); }

  protected changeStatus(status: SuggestionStatus) {
    this.status.set(status); this.message.set(''); void this.load();
  }

  protected async load(page = 1) {
    const sequence = ++this.sequence;
    this.loading.set(true); this.error.set(''); this.ready.set(false);
    try {
      const result = await firstValueFrom(this.api.list(this.status(), page));
      if (sequence !== this.sequence) return;
      this.items.set(result.items); this.total.set(result.total); this.page.set(result.page); this.ready.set(true);
    } catch { if (sequence === this.sequence) this.error.set('No pudimos cargar las sugerencias. Tocá Actualizar lista para reintentar.'); }
    finally { if (sequence === this.sequence) this.loading.set(false); }
  }

  protected review(item: ServiceSuggestion) {
    this.name = item.name; this.categoryId = ''; this.serviceId = ''; this.reason = ''; this.requiresLicense = false; this.mode = 'CREATE';
    this.actionError.set(''); this.selected.set(item);
  }
  protected close() { if (!this.busy()) this.selected.set(null); }

  protected async save() {
    const item = this.selected();
    if (!item || this.busy()) return;
    this.actionError.set('');
    if ((this.mode === 'CREATE' && (this.name.trim().length < 3 || !this.categoryId)) || (this.mode === 'LINK' && !this.serviceId) || (this.mode === 'REJECT' && this.reason.trim().length < 3)) {
      this.actionError.set('Completá los datos de la acción elegida.'); return;
    }
    this.busy.set(true);
    try {
      await firstValueFrom(this.mode === 'REJECT' ? this.api.reject(item.id, this.reason.trim()) : this.api.approve(item.id, this.mode === 'LINK' ? { serviceId: this.serviceId } : { name: this.name.trim(), categoryId: this.categoryId, requiresLicense: this.requiresLicense }));
      this.selected.set(null); this.message.set(this.mode === 'REJECT' ? 'Sugerencia rechazada. La persona podrá ver el motivo.' : 'Oficio aprobado. La persona ya puede elegirlo del catálogo.');
      if (this.mode === 'CREATE') this.catalog.refresh();
      await this.load();
    } catch (e) {
      const error = classifyError(e);
      this.actionError.set(error.kind === 'conflict' ? 'La sugerencia ya fue revisada o el oficio ya existe. Actualizá la lista o elegí un oficio existente.' : error.kind === 'validation' ? 'Revisá los datos: nombre, categoría y textos sin datos personales ni enlaces.' : 'No pudimos guardar la revisión. Reintentá.');
    } finally { this.busy.set(false); }
  }
}
