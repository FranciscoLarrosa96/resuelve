import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ProStore } from '../../core/state/pro.store';
import { Icon } from '../../shared/components/icon/icon';
import { serviceGap } from './activation';

/**
 * Perfil creado sin ningún oficio aprobado: dice con claridad que todavía no está publicado, qué
 * se espera y qué hacer. Desaparece solo cuando el perfil tiene un oficio (aprobado o elegido).
 * Los demás requisitos de publicación (cobertura, perfil activo) los sigue explicando Mi perfil.
 */
@Component({
  selector: 'app-publication-notice',
  imports: [RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (gap(); as g) {
      <section class="mt-4 rounded-2xl border border-accent-line bg-accent-soft p-4" role="status" data-testid="publication-notice">
        <div class="flex items-start gap-3">
          <app-icon name="clock" [size]="20" [stroke]="2.2" class="mt-0.5 shrink-0 text-accent-strong" />
          <div class="min-w-0">
            @if (g.names.length) {
              <h2 class="text-[16px] font-bold text-accent-ink">Tu perfil está pendiente de publicación</h2>
              <p class="mt-1 text-[14.5px] leading-[1.5] text-ink-soft">
                Estamos revisando {{ names() }}. Hasta que lo aprobemos no aparecés en las búsquedas ni recibís solicitudes de ese oficio.
                Te avisamos acá apenas lo resolvamos; si lo aprobamos, se suma a tu perfil sin que tengas que cargar nada de nuevo.
              </p>
              <a routerLink="/pro/perfil" [queryParams]="{ editar: 'services' }" class="mt-2 inline-flex min-h-11 items-center font-semibold text-brand underline underline-offset-2">
                Ver mis servicios
              </a>
            } @else {
              <h2 class="text-[16px] font-bold text-accent-ink">Tu perfil todavía no está publicado</h2>
              <p class="mt-1 text-[14.5px] leading-[1.5] text-ink-soft">
                No tiene ningún oficio aprobado, así que no aparece en las búsquedas ni recibe solicitudes. Elegí un oficio de la lista o
                corregí el nombre y volvé a sugerirlo.
              </p>
              <a routerLink="/pro/perfil" [queryParams]="{ editar: 'services' }" class="mt-2 inline-flex min-h-11 items-center font-semibold text-brand underline underline-offset-2">
                Elegir un oficio
              </a>
            }
          </div>
        </div>
      </section>
    }
  `,
})
export class PublicationNotice {
  private readonly store = inject(ProStore);
  protected readonly gap = computed(() => serviceGap(this.store.ownProfile()));
  protected readonly names = computed(() => {
    const names = (this.gap()?.names ?? []).map((n) => `“${n}”`);
    return names.length > 1 ? `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}` : (names[0] ?? '');
  });
}
