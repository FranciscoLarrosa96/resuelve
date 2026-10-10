import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import {
  Injectable,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { AuthApiService } from '../api/auth-api.service';
import { LocalityRef, toLocalityRef } from '../models/locality';
import { AuthStore } from './auth.store';

/** Clave de localStorage de la ciudad elegida (solo id + datos para mostrarla). */
export const LOCALITY_STORAGE_KEY = 'resuelve-locality';

/** De dónde salió la ciudad actual (para la precedencia y para no pisar una elección). */
export type LocalitySource = 'url' | 'user' | 'account' | 'suggested' | null;

const PRECEDENCE: Record<Exclude<LocalitySource, null>, number> = {
  url: 4,
  user: 3,
  account: 2,
  suggested: 1,
};

/**
 * Ciudad donde la persona busca: ÚNICA fuente para inicio, resultados, urgencias,
 * pedidos nuevos y vitrina PRO. Precedencia (de mayor a menor):
 *  1. la localidad de la URL (`?provincia=…&ciudad=…` o `/ciudades/…`): compartible;
 *  2. la que eligió la persona en el selector (se guarda en este navegador);
 *  3. la preferencia de su cuenta (`preferredLocality`), si no eligió otra acá;
 *  4. una sugerida (solo si la persona la acepta);
 *  5. ninguna: se pide elegir. Nunca se impone una ciudad por defecto.
 *
 * Elegir con sesión también la guarda en la cuenta (sin bloquear la UI).
 */
@Injectable({ providedIn: 'root' })
export class LocalityStore {
  private readonly document = inject(DOCUMENT);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly auth = inject(AuthStore);
  private readonly authApi = inject(AuthApiService);

  private readonly _current = signal<LocalityRef | null>(null);
  private readonly _source = signal<LocalitySource>(null);
  /** Lo guardado en este navegador (la elección explícita), aunque una URL muestre otra. */
  private readonly stored = signal<LocalityRef | null>(this.read());

  readonly current = this._current.asReadonly();
  readonly source = this._source.asReadonly();
  readonly id = computed(() => this._current()?.id ?? null);
  readonly name = computed(() => this._current()?.name ?? null);
  readonly label = computed(() => this._current()?.label ?? null);
  /** Cambia con cada selección: los listados lo usan para descartar resultados viejos. */
  readonly version = signal(0);

  constructor() {
    const stored = this.stored();
    if (stored) this.set(stored, 'user');
    if (!this.browser) return;
    // 3. Preferencia de la cuenta: solo si no hay una elección propia en este navegador.
    effect(() => {
      // `user` puede faltar en dobles de test de AuthStore.
      const preferred =
        typeof this.auth.user === 'function' ? this.auth.user()?.preferredLocality : null;
      untracked(() => {
        if (!preferred || this._current()) return;
        const ref = toLocalityRef(preferred);
        if (ref) this.set(ref, 'account');
      });
    });
  }

  /**
   * La persona eligió una ciudad: se usa ya, se recuerda en este navegador y, con
   * sesión, en la cuenta. Una URL con otra ciudad la sigue mostrando la URL.
   */
  choose(locality: LocalityRef): void {
    this.set(locality, 'user');
    this.stored.set(locality);
    this.write(locality);
    if (this.auth.authenticated() && this.auth.user()?.preferredLocality?.id !== locality.id) {
      this.authApi.setPreferredLocality(locality.id).subscribe({ error: () => undefined });
    }
  }

  /** La URL manda (compartir/recargar): no cambia lo guardado por la persona. */
  fromUrl(locality: LocalityRef): void {
    this.set(locality, 'url');
  }

  /** Sugerencia (p. ej. "Usar mi ubicación"): solo si todavía no hay ninguna. */
  suggest(locality: LocalityRef): void {
    if (!this._current()) this.set(locality, 'suggested');
  }

  /** "Cambiar ciudad" desde un estado vacío: vuelve a pedir elegir. */
  clear(): void {
    this._current.set(null);
    this._source.set(null);
    this.stored.set(null);
    this.write(null);
    this.version.update((v) => v + 1);
  }

  private set(locality: LocalityRef, source: Exclude<LocalitySource, null>): void {
    const current = this._current();
    const currentSource = this._source();
    // Una sugerencia o la cuenta nunca pisan una elección explícita o la URL.
    if (
      current &&
      currentSource &&
      PRECEDENCE[source] < PRECEDENCE[currentSource] &&
      source !== 'user'
    )
      return;
    if (current?.id === locality.id && currentSource === source) return;
    this._current.set(locality);
    this._source.set(source);
    if (current?.id !== locality.id) this.version.update((v) => v + 1);
  }

  private read(): LocalityRef | null {
    if (!this.browser) return null;
    try {
      const raw = this.document.defaultView?.localStorage.getItem(LOCALITY_STORAGE_KEY);
      return raw ? toLocalityRef(JSON.parse(raw)) : null;
    } catch {
      return null;
    }
  }

  private write(locality: LocalityRef | null): void {
    if (!this.browser) return;
    try {
      const storage = this.document.defaultView?.localStorage;
      if (locality) storage?.setItem(LOCALITY_STORAGE_KEY, JSON.stringify(locality));
      else storage?.removeItem(LOCALITY_STORAGE_KEY);
    } catch {
      // Sin storage (modo privado estricto): la elección vale para esta pestaña.
    }
  }
}
