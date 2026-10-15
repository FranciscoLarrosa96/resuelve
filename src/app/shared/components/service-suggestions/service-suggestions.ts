import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { classifyError } from '../../../core/api/api-error';
import { ServiceSuggestion, ServiceSuggestionsApi } from '../../../core/api/service-suggestions-api.service';
import { contactInText } from '../../../core/utils/contact-in-text';

@Component({
  selector: 'app-service-suggestions',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="mt-6 border-t border-line pt-5" aria-label="Sugerir un oficio">
      <button type="button" class="min-h-11 text-left font-semibold text-brand underline underline-offset-2" [attr.aria-expanded]="open()" (click)="toggle()">¿Tu oficio no está en la lista?</button>
      @if (open()) {
        <p class="mt-2 text-sm leading-6 text-ink-soft">Sugerilo para que lo revisemos. Si lo aprobamos, lo vas a poder elegir y también estará disponible para los demás. No necesitás elegir un rubro que no corresponda.</p>
        <label class="mt-4 block text-sm font-semibold">Nombre del oficio
          <input type="text" maxlength="80" class="mt-1.5 min-h-12 w-full rounded-xl field-control px-3" placeholder="Por ejemplo: corte de pasto" [value]="name()" (input)="name.set($any($event.target).value)" (keydown.enter)="$event.preventDefault(); send()" [disabled]="busy()" />
        </label>
        <p class="mt-2 text-xs text-muted">Solo el oficio, sin teléfonos, emails ni enlaces. Hasta 5 sugerencias pendientes.</p>
        <button type="button" class="button-secondary mt-3 min-h-11 rounded-xl px-4 font-semibold disabled:opacity-50" [disabled]="busy() || loading()" (click)="send()">{{ busy() ? 'Enviando…' : 'Enviar sugerencia' }}</button>
        @if (message()) { <p class="mt-3 text-sm text-success" role="status">{{ message() }}</p> }
        @if (error()) { <p class="mt-3 text-sm text-danger" role="alert">{{ error() }}</p> }
        <div class="mt-6 flex flex-wrap items-center justify-between gap-2">
          <h3 class="font-semibold">Tus sugerencias</h3>
          <button type="button" class="min-h-11 text-sm font-semibold text-brand underline disabled:opacity-50" [disabled]="loading() || busy()" (click)="load()">Actualizar estado</button>
        </div>
        @if (loading()) { <p class="text-sm text-muted" role="status">Cargando sugerencias…</p> }
        @else if (loaded() && !items().length) { <p class="mt-2 text-sm text-muted">Todavía no enviaste sugerencias.</p> }
        <ul class="mt-2 divide-y divide-line">
          @for (item of items(); track item.id) {
            <li class="py-4">
              <p class="break-words font-semibold">{{ item.name }}</p>
              @switch (item.status) {
                @case ('PENDING') { <p class="mt-1 text-sm text-muted">Pendiente de revisión. Volvé a consultar el estado desde acá.</p> }
                @case ('APPROVED') {
                  <p class="mt-1 text-sm text-success">Aprobado como {{ item.serviceName }}.</p>
                  @if (item.serviceActive && item.serviceId) { <button type="button" class="mt-2 min-h-11 text-left font-semibold text-brand underline" (click)="selected.emit(item.serviceId)">Elegir {{ item.serviceName }}</button> }
                  @else { <p class="mt-1 text-sm text-muted">Este oficio ya no está disponible en el catálogo.</p> }
                }
                @case ('REJECTED') { <p class="mt-1 text-sm text-muted">No aprobado: {{ item.reason }}</p> }
              }
            </li>
          }
        </ul>
      }
    </section>
  `,
})
export class ServiceSuggestions {
  private readonly api = inject(ServiceSuggestionsApi);
  readonly selected = output<string>();
  protected readonly open = signal(false);
  protected readonly name = signal('');
  protected readonly busy = signal(false);
  protected readonly loading = signal(false);
  protected readonly loaded = signal(false);
  protected readonly items = signal<ServiceSuggestion[]>([]);
  protected readonly error = signal('');
  protected readonly message = signal('');

  protected toggle() {
    this.open.update((v) => !v);
    if (this.open() && !this.loaded()) void this.load();
  }

  protected async load() {
    if (this.loading() || this.busy()) return;
    this.loading.set(true);
    this.error.set('');
    try { this.items.set(await firstValueFrom(this.api.mine())); this.loaded.set(true); }
    catch { this.error.set('No pudimos cargar tus sugerencias. Tocá Actualizar estado para reintentar.'); }
    finally { this.loading.set(false); }
  }

  protected async send() {
    if (this.busy() || this.loading()) return;
    const name = this.name().replace(/\s+/g, ' ').trim();
    this.error.set(''); this.message.set('');
    if (name.length < 3 || name.length > 80 || contactInText(name) || /https?:\/\/|www\.|[<>]/i.test(name)) {
      this.error.set('Escribí un oficio de 3 a 80 caracteres, sin teléfonos, emails ni enlaces.'); return;
    }
    this.busy.set(true);
    try {
      const item = await firstValueFrom(this.api.suggest(name));
      this.items.update((items) => [item, ...items.filter((i) => i.id !== item.id)].slice(0, 30));
      this.name.set('');
      this.message.set('Tu sugerencia está pendiente de revisión. Podés consultar el estado acá.');
    } catch (e) {
      const error = classifyError(e);
      this.error.set(error.kind === 'conflict' ? 'Alcanzaste el límite: hasta 5 pendientes y 10 sugerencias cada 30 días.'
        : error.kind === 'validation' ? 'Revisá el nombre: solo el oficio, sin datos de contacto ni enlaces.'
        : 'No pudimos enviar la sugerencia. Tu texto sigue acá; reintentá.');
    } finally { this.busy.set(false); }
  }
}
