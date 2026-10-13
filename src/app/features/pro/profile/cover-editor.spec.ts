import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { ProStore } from '../../../core/state/pro.store';
import { CoverEditor } from './cover-editor';

function open(opts: { pro: boolean; coverUrl?: string | null; savedCoverUrl?: string | null }) {
  const store = {
    entitlements: signal({ canUseCoverPhoto: opts.pro }),
    ownProfile: signal({ coverUrl: opts.coverUrl ?? null, savedCoverUrl: opts.savedCoverUrl ?? null }),
    coverUpload: signal(null),
    coverError: signal<string | null>(null),
    uploadCover: vi.fn().mockResolvedValue(true),
    removeCover: vi.fn().mockResolvedValue(true),
  };
  TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: ProStore, useValue: store }] });
  const fixture = TestBed.createComponent(CoverEditor);
  fixture.detectChanges();
  return { el: fixture.nativeElement as HTMLElement, store };
}

describe('foto de portada (PRO) en Mi perfil', () => {
  it('Free: bloqueada, dice que es de PRO y enlaza a Mi plan; no ofrece subir', () => {
    const { el } = open({ pro: false });
    const locked = el.querySelector('[data-testid="cover-locked"]')!;
    expect(locked.textContent).toContain('Foto de portada · Resuelve PRO.');
    expect(locked.querySelector('a')!.getAttribute('href')).toBe('/pro/plan');
    expect(el.querySelector('[data-testid="cover-add"]')).toBeNull();
    expect(el.querySelector<HTMLInputElement>('#cover-file')!.disabled).toBe(true);
  });

  it('Free con una portada guardada de cuando fue PRO: avisa que vuelve con PRO y se puede quitar', () => {
    const { el, store } = open({ pro: false, savedCoverUrl: 'https://img.test/c.jpg' });
    expect(el.textContent).toContain('Tu portada está guardada y se vuelve a ver cuando tengas PRO.');
    [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Quitar portada'))!.click();
    expect(store.removeCover).toHaveBeenCalledTimes(1);
  });

  it('PRO sin portada: "Sumá una foto de portada"; con portada: la muestra con Cambiar y Quitar', () => {
    const { el } = open({ pro: true });
    expect(el.querySelector('[data-testid="cover-add"]')!.textContent).toContain('Sumá una foto de portada');
    TestBed.resetTestingModule();
    const withCover = open({ pro: true, coverUrl: 'https://img.test/c.jpg' }).el;
    expect(withCover.querySelector('[data-testid="cover-current"] img')!.getAttribute('src')).toBe('https://img.test/c.jpg');
    expect(withCover.textContent).toContain('Cambiar portada');
    expect(withCover.textContent).toContain('Quitar');
  });
});
