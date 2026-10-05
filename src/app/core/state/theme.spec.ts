import { TestBed } from '@angular/core/testing';
import { THEME_STORAGE_KEY, ThemeStore } from './theme.store';

/** matchMedia controlable (jsdom no lo trae). */
function mockSystem(dark: boolean) {
  const listeners: ((e: { matches: boolean }) => void)[] = [];
  const mql = {
    matches: dark,
    addEventListener: (_: string, fn: (e: { matches: boolean }) => void) => listeners.push(fn),
    removeEventListener: () => undefined,
  };
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => mql });
  return (next: boolean) => {
    mql.matches = next;
    listeners.forEach((fn) => fn({ matches: next }));
  };
}

describe('ThemeStore', () => {
  beforeEach(() => {
    localStorage.removeItem(THEME_STORAGE_KEY);
    delete document.documentElement.dataset['theme'];
  });
  afterEach(() => localStorage.removeItem(THEME_STORAGE_KEY));

  it('sin preferencia guardada: Claro, aunque el sistema sea oscuro', () => {
    mockSystem(true);
    const store = TestBed.inject(ThemeStore);
    expect(store.preference()).toBe('light');
    expect(document.documentElement.dataset['theme']).toBe('light');
  });

  it('Sistema (elegido) sigue al sistema operativo en vivo', () => {
    const setSystem = mockSystem(true);
    localStorage.setItem(THEME_STORAGE_KEY, 'system');
    const store = TestBed.inject(ThemeStore);
    expect(store.preference()).toBe('system');
    expect(document.documentElement.dataset['theme']).toBe('dark');
    setSystem(false);
    expect(store.resolved()).toBe('light');
    expect(document.documentElement.dataset['theme']).toBe('light');
  });

  it('lee la preferencia guardada (y descarta valores inválidos)', () => {
    mockSystem(true);
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    expect(TestBed.inject(ThemeStore).resolved()).toBe('light');
    TestBed.resetTestingModule();
    localStorage.setItem(THEME_STORAGE_KEY, 'neon');
    expect(TestBed.inject(ThemeStore).preference()).toBe('light');
  });

  it('Claro / Oscuro fijos ignoran el sistema y persisten', () => {
    const setSystem = mockSystem(false);
    const store = TestBed.inject(ThemeStore);
    store.set('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    setSystem(false);
    expect(document.documentElement.dataset['theme']).toBe('dark');
    store.set('system');
    expect(document.documentElement.dataset['theme']).toBe('light');
  });
});
