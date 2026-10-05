import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { DestroyRef, Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

/** Misma clave que lee el script anti-flash de `index.html`. */
export const THEME_STORAGE_KEY = 'resuelve-theme';
export const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'light', label: 'Claro' },
  { value: 'dark', label: 'Oscuro' },
  { value: 'system', label: 'Sistema' },
];
/** `<meta name="theme-color">` por tema (canvas de cada modo). */
const THEME_COLOR: Record<ResolvedTheme, string> = { light: '#F7F3EB', dark: '#101615' };

const isPreference = (v: unknown): v is ThemePreference => v === 'light' || v === 'dark' || v === 'system';

/**
 * Tema de la interfaz: Claro, Oscuro o Sistema (default). La preferencia vive
 * en localStorage (`resuelve-theme`); el script de `index.html` ya aplicó
 * `data-theme` antes de pintar, así que acá solo se mantiene sincronizado
 * (cambio desde el menú o del sistema operativo en modo "Sistema").
 */
@Injectable({ providedIn: 'root' })
export class ThemeStore {
  private readonly document = inject(DOCUMENT);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly media = this.browser ? (this.document.defaultView?.matchMedia?.('(prefers-color-scheme: dark)') ?? null) : null;
  private readonly systemDark = signal(this.media?.matches ?? false);
  private transitionTimer: ReturnType<typeof setTimeout> | undefined;

  readonly preference = signal<ThemePreference>(this.read());
  readonly resolved = computed<ResolvedTheme>(() => {
    const p = this.preference();
    return p === 'system' ? (this.systemDark() ? 'dark' : 'light') : p;
  });

  constructor() {
    if (!this.browser) return;
    const onChange = (e: MediaQueryListEvent) => {
      this.systemDark.set(e.matches);
      this.apply();
    };
    this.media?.addEventListener?.('change', onChange);
    inject(DestroyRef).onDestroy(() => {
      this.media?.removeEventListener?.('change', onChange);
      clearTimeout(this.transitionTimer);
      delete this.document.documentElement.dataset['themeTransition'];
    });
    this.apply();
  }

  set(preference: ThemePreference): void {
    this.preference.set(preference);
    try {
      this.document.defaultView?.localStorage.setItem(THEME_STORAGE_KEY, preference);
    } catch {
      // Sin storage (modo privado estricto): el tema vale para esta pestaña.
    }
    this.apply();
  }

  private read(): ThemePreference {
    if (!this.browser) return 'light';
    try {
      const stored = this.document.defaultView?.localStorage.getItem(THEME_STORAGE_KEY);
      return isPreference(stored) ? stored : 'light';
    } catch {
      return 'light';
    }
  }

  private apply(): void {
    const theme = this.resolved();
    const root = this.document.documentElement;
    if (this.browser && root.dataset['theme'] && root.dataset['theme'] !== theme) {
      root.dataset['themeTransition'] = '';
      clearTimeout(this.transitionTimer);
      this.transitionTimer = setTimeout(() => delete root.dataset['themeTransition'], 240);
    }
    root.dataset['theme'] = theme;
    this.document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme]);
  }
}
