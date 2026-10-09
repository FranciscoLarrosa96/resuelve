import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Logo } from '../../shared/components/logo/logo';

export type AdminSection = 'matriculas' | 'reportes' | 'precio' | 'pagos' | 'usuarios';

const SECTIONS: { id: AdminSection; label: string }[] = [
  { id: 'matriculas', label: 'Matrículas' },
  { id: 'reportes', label: 'Reportes' },
  { id: 'precio', label: 'Precio' },
  { id: 'pagos', label: 'Pagos' },
  { id: 'usuarios', label: 'Usuarios' },
];

/** Encabezado del panel admin: única fuente de las secciones (en mobile, la barra se desliza sin mover la página). */
@Component({
  selector: 'app-admin-header',
  imports: [RouterLink, Logo],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sticky top-0 z-20 block border-b border-track bg-canvas/95 backdrop-blur-md' },
  template: `
    <header
      class="mx-auto flex h-16 items-center gap-3 px-4 sm:px-6"
      [class]="wide() ? 'max-w-6xl' : 'max-w-4xl'"
    >
      <a routerLink="/" class="shrink-0 rounded-lg" aria-label="Resuelve, inicio"><app-logo /></a>
      <span
        class="hidden shrink-0 rounded-md bg-sand-dark px-1.5 py-0.5 text-[14px] font-semibold text-ink-soft sm:inline"
        >Admin</span
      >
      <nav
        class="ml-auto flex min-w-0 items-center overflow-x-auto [scrollbar-width:none]"
        aria-label="Secciones del panel"
      >
        @for (s of sections; track s.id) {
          <a
            [routerLink]="'/admin/' + s.id"
            [attr.aria-current]="current() === s.id ? 'page' : null"
            class="shrink-0 rounded-lg px-2 py-2 text-[14px] font-semibold sm:px-3"
            [class]="current() === s.id ? 'bg-sand text-ink' : 'text-ink-soft hover:bg-sand'"
            >{{ s.label }}</a
          >
        }
      </nav>
    </header>
  `,
})
export class AdminHeader {
  readonly current = input.required<AdminSection>();
  /** Matrículas usa el ancho de lista + detalle. */
  readonly wide = input(false);
  protected readonly sections = SECTIONS;
}
