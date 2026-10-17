import { Injectable, InjectionToken, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { LocalitiesApiService } from '../api/localities-api.service';
import { toLocalityRef } from '../models/locality';
import { LocalityStore } from './locality.store';
import { RequestStore } from './request.store';

/**
 * Qué pasó con la ciudad que traía el enlace (`?provincia=<slug>&ciudad=<slug>`):
 *  - `none`: el enlace no trae ciudad (nada cambia);
 *  - `resolving`: se está confirmando en el catálogo;
 *  - `applied`: es una localidad real y ahora es la ciudad de navegación;
 *  - `invalid`: no existe en el catálogo (o no se pudo confirmar): NO se reemplaza por otra;
 *  - `incomplete`: falta la provincia o la ciudad: es ambiguo (hay localidades homónimas);
 *  - `order`: hay un pedido en curso con otra localidad de trabajo: manda la del pedido.
 */
export type LocalityLinkState = 'none' | 'resolving' | 'applied' | 'invalid' | 'incomplete' | 'order';

/** `always`: la URL siempre refleja la ciudad (resultados); `whenLinked`: solo si el enlace ya la traía. */
export const LOCALITY_LINK_MODE = new InjectionToken<'always' | 'whenLinked'>('LOCALITY_LINK_MODE');

/**
 * Lee la ciudad de los enlaces con parámetros y la refleja en `LocalityStore` (única fuente de
 * "dónde busca la persona"). Una instancia por página (`providers: [LocalityLink]`).
 *
 * Nunca toca la ubicación del trabajo de un pedido (`draft.locality`): la ciudad de navegación y la
 * del pedido son cosas distintas. Un enlace desconocido o ambiguo no elige ciudad en silencio.
 */
@Injectable()
export class LocalityLink {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly locality = inject(LocalityStore);
  private readonly request = inject(RequestStore);
  private readonly api = inject(LocalitiesApiService);
  private readonly params = toSignal(this.route.queryParamMap);

  private readonly _state = signal<LocalityLinkState>('none');
  readonly state = this._state.asReadonly();
  /** Lo que pedía el enlace, para decirlo ("tandil, buenos-aires"). */
  readonly requested = signal('');
  /** Versión de la ciudad cuando el enlace quedó sin resolver: si cambia, la persona eligió otra. */
  private unresolvedAt: number | null = null;
  private lastResolved = '';
  private reflected: string | null | undefined = undefined;

  /** `provincia/ciudad` del enlace (null = sin parámetros o incompletos). */
  readonly path = computed(() => {
    const province = this.params()?.get('provincia')?.trim();
    const city = this.params()?.get('ciudad')?.trim();
    return province && city ? `${province}/${city}` : null;
  });
  private readonly hasAnyParam = computed(
    () => !!(this.params()?.get('provincia') || this.params()?.get('ciudad')),
  );
  /** Hay que avisar: el enlace no pudo decidir la ciudad. */
  readonly needsNotice = computed(() => ['invalid', 'incomplete', 'order'].includes(this._state()));
  /** La ciudad de navegación terminó siendo la de un enlace que se aplicó. */
  readonly resolving = computed(() => this._state() === 'resolving');
  /** Localidad de trabajo del pedido en curso (si el enlace viene de él). */
  readonly orderLocality = computed(() =>
    this.params()?.has('pedido') && this.request.hasContext() ? this.request.draft().locality : null,
  );

  private readonly mode = inject(LOCALITY_LINK_MODE, { optional: true }) ?? 'whenLinked';

  constructor() {
    // 1. Resolver el enlace (nunca por nombre suelto: provincia + slug, en el backend).
    effect(() => {
      const path = this.path();
      const any = this.hasAnyParam();
      const order = this.orderLocality();
      untracked(() => this.resolve(path, any, order?.path ?? null));
    });
    // 2. La persona eligió otra ciudad: el enlace deja de mandar y la URL la refleja.
    effect(() => {
      const current = this.locality.current();
      const version = this.locality.version();
      const state = this._state();
      untracked(() => this.reflect(current?.path ?? null, version, state));
    });
  }

  private resolve(path: string | null, any: boolean, orderPath: string | null): void {
    if (!any) {
      this.lastResolved = '';
      this.unresolvedAt = null;
      this._state.set('none');
      return;
    }
    this.requested.set(path ?? '');
    if (!path) return this.markUnresolved('incomplete');
    if (orderPath && orderPath !== path) {
      // Manda la ubicación del pedido (que no se modifica): se navega en esa ciudad.
      const work = untracked(() => this.orderLocality());
      const ref = work ? toLocalityRef(work) : null;
      if (ref) this.locality.fromUrl(ref);
      return this.markUnresolved('order');
    }
    if (path === this.locality.current()?.path) {
      this.unresolvedAt = null;
      this._state.set('applied');
      return;
    }
    if (path === this.lastResolved) return;
    this.lastResolved = path;
    const [province, city] = path.split('/');
    this._state.set('resolving');
    this.api.getBySlug(province, city).subscribe({
      next: (detail) => {
        const ref = toLocalityRef(detail);
        if (!ref) return this.markUnresolved('invalid');
        this.locality.fromUrl(ref);
        this.unresolvedAt = null;
        this._state.set('applied');
      },
      error: () => this.markUnresolved('invalid'),
    });
  }

  private markUnresolved(state: 'invalid' | 'incomplete' | 'order'): void {
    this.unresolvedAt = untracked(() => this.locality.version());
    this._state.set(state);
  }

  private reflect(currentPath: string | null, version: number, state: LocalityLinkState): void {
    if (state === 'resolving') return;
    if (state === 'none') {
      // Solo cuando cambia la ciudad (no cada vez que la URL queda sin parámetros).
      const changed = currentPath !== this.reflected;
      this.reflected = currentPath;
      if (changed && this.mode === 'always' && currentPath && !this.hasAnyParam())
        this.writeUrl(currentPath);
      return;
    }
    this.reflected = currentPath;
    if (state === 'applied') {
      if (currentPath && currentPath !== this.path()) this.writeUrl(currentPath);
      return;
    }
    // Enlace sin resolver: sigue el aviso hasta que la persona elija OTRA ciudad.
    if (this.unresolvedAt !== null && version !== this.unresolvedAt && currentPath) {
      this.unresolvedAt = null;
      this._state.set('none');
      this.lastResolved = '';
      this.writeUrl(currentPath);
    }
  }

  private writeUrl(path: string): void {
    const [province, city] = path.split('/');
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { provincia: province, ciudad: city },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
