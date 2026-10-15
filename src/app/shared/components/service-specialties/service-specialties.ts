import { ChangeDetectionStrategy, Component, computed, input, model, signal } from '@angular/core';
import { ServiceSpecialties } from '../../../core/models/pro-profile';
import { contactInText } from '../../../core/utils/contact-in-text';

/** Mismo editor en el alta y en Mi perfil. Los rubros siguen saliendo del catálogo. */
@Component({
  selector: 'app-service-specialties',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="mt-6 border-t border-line pt-5" aria-label="Especialidades propias">
      <button
        type="button"
        class="min-h-11 text-left font-semibold text-brand underline underline-offset-2"
        [attr.aria-expanded]="open()"
        (click)="expanded.set(!open())"
      >
        ¿No encontrás tu servicio específico?
      </button>
      @if (open()) {
        <p class="mt-2 text-sm leading-6 text-ink-soft">
          Elegí el rubro que lo incluye y agregá el nombre de tu especialidad. Se muestra en tu
          perfil; los clientes te encuentran por ese rubro. No crea una nueva matrícula ni una
          verificación.
        </p>
        @if (!services().length) {
          <p class="mt-3 text-sm text-muted" role="status">
            Primero elegí al menos un servicio de la lista.
          </p>
        } @else {
          <div class="mt-4 grid gap-3 sm:grid-cols-2">
            <label class="text-sm font-semibold"
              >Rubro
              <select
                class="mt-1.5 w-full min-h-12 rounded-xl field-control px-3"
                [value]="selectedId()"
                (change)="selected.set($any($event.target).value); error.set('')"
              >
                @for (s of services(); track s.id) {
                  <option [value]="s.id">{{ s.name }}</option>
                }
              </select>
            </label>
            <label class="text-sm font-semibold"
              >Nombre de la especialidad
              <input
                type="text"
                maxlength="60"
                class="mt-1.5 w-full min-h-12 rounded-xl field-control px-3"
                placeholder="Por ejemplo: reparación de consolas"
                [value]="name()"
                (input)="name.set($any($event.target).value); error.set('')"
                (keydown.enter)="$event.preventDefault(); add()"
              />
            </label>
          </div>
          <p class="mt-2 text-xs text-muted">
            Hasta 5 por rubro. Sin teléfonos, emails ni enlaces.
          </p>
          <button
            type="button"
            class="button-secondary mt-3 min-h-11 rounded-xl px-4 text-sm font-semibold"
            (click)="add()"
          >
            Agregar especialidad
          </button>
          @if (error()) {
            <p class="mt-2 text-sm text-danger" role="alert">{{ error() }}</p>
          }
        }
      }
      @if (entries().length) {
        <ul class="mt-4 space-y-3" aria-label="Especialidades agregadas">
          @for (entry of entries(); track entry.id) {
            <li>
              <p class="text-sm font-semibold">{{ entry.label }}</p>
              <ul class="mt-1 flex flex-wrap gap-2">
                @for (n of entry.names; track n) {
                  <li
                    class="inline-flex max-w-full items-center gap-2 rounded-lg bg-brand-tint pl-3 text-sm text-brand"
                  >
                    <span class="min-w-0 break-words">{{ n }}</span>
                    <button
                      type="button"
                      class="min-h-11 min-w-11 shrink-0 rounded-lg font-bold"
                      [attr.aria-label]="'Quitar ' + n"
                      (click)="remove(entry.id, n)"
                    >
                      ×
                    </button>
                  </li>
                }
              </ul>
            </li>
          }
        </ul>
      }
    </section>
  `,
})
export class ServiceSpecialtiesEditor {
  readonly services = input.required<readonly { id: string; name: string }[]>();
  readonly specialties = model<ServiceSpecialties[]>([]);
  protected readonly expanded = signal(false);
  protected readonly open = computed(() => this.expanded());
  protected readonly selected = signal('');
  protected readonly selectedId = computed(() =>
    this.services().some((s) => s.id === this.selected())
      ? this.selected()
      : (this.services()[0]?.id ?? ''),
  );
  protected readonly name = signal('');
  protected readonly error = signal('');
  protected readonly entries = computed(() =>
    this.services().flatMap((s) => {
      const names = this.specialties().find((e) => e.serviceId === s.id)?.names ?? [];
      return names.length ? [{ id: s.id, label: s.name, names }] : [];
    }),
  );

  protected add(): void {
    const id = this.selectedId();
    const name = this.name().replace(/\s+/g, ' ').trim();
    const fail = (text: string) => this.error.set(text);
    if (!id) return fail('Elegí primero un rubro de la lista.');
    if (name.length < 2 || name.length > 60) return fail('Escribí entre 2 y 60 caracteres.');
    if (contactInText(name) || /(?:https?:\/\/|www\.)/i.test(name))
      return fail('No incluyas teléfonos, emails ni enlaces.');
    const names = this.specialties().find((e) => e.serviceId === id)?.names ?? [];
    const fold = (v: string) =>
      v
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase('es');
    if (names.some((n) => fold(n) === fold(name))) return fail('Ya agregaste esa especialidad.');
    if (names.length >= 5) return fail('Podés agregar hasta 5 especialidades por rubro.');
    this.specialties.update((items) => [
      ...items.filter((e) => e.serviceId !== id),
      { serviceId: id, names: [...names, name] },
    ]);
    this.name.set('');
    this.error.set('');
  }

  protected remove(id: string, name: string): void {
    this.specialties.update((items) =>
      items.map((e) =>
        e.serviceId === id ? { ...e, names: e.names.filter((n) => n !== name) } : e,
      ),
    );
  }
}
