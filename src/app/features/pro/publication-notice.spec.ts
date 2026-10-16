import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { OwnProfessional } from '../../core/models/pro-profile';
import { ProStore } from '../../core/state/pro.store';
import { PublicationNotice } from './publication-notice';
import { serviceGap } from './activation';

const own = (publication: unknown) => ({ id: 'p', status: 'ACTIVE', offeredServices: [], publication }) as unknown as OwnProfessional;

function render(profile: OwnProfessional | null) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: ProStore, useValue: { ownProfile: signal(profile) } }] });
  const fixture = TestBed.createComponent(PublicationNotice);
  fixture.detectChanges();
  return (fixture.nativeElement as HTMLElement).textContent!.replace(/\s+/g, ' ');
}

describe('aviso de perfil pendiente de publicación', () => {
  it('con un oficio en revisión explica qué pasa y que se avisa', () => {
    const t = render(own({ published: false, blockers: ['NO_SERVICE'], pendingSuggestions: [{ id: '1', name: 'Pérgolas' }, { id: '2', name: 'Toldos' }] }));
    expect(t).toContain('Tu perfil está pendiente de publicación');
    expect(t).toContain('“Pérgolas” y “Toldos”');
    expect(t).toContain('sin que tengas que cargar nada de nuevo');
  });

  it('tras un rechazo (sin nada en revisión) pide elegir un oficio', () => {
    const t = render(own({ published: false, blockers: ['NO_SERVICE'], pendingSuggestions: [] }));
    expect(t).toContain('Tu perfil todavía no está publicado');
    expect(t).toContain('Elegir un oficio');
  });

  it('no aparece si el perfil tiene oficio, aunque falte otro requisito, ni sin dato del backend', () => {
    expect(render(own({ published: false, blockers: ['PAUSED'], pendingSuggestions: [] }))).toBe('');
    expect(render(own({ published: true, blockers: [], pendingSuggestions: [] }))).toBe('');
    expect(serviceGap(own(undefined))).toBeNull();
    expect(render(null)).toBe('');
  });
});
