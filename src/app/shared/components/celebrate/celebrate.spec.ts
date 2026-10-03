import { TestBed } from '@angular/core/testing';
import { Celebrate } from './celebrate';

describe('Celebrate', () => {
  it('es decorativo: oculto a lectores de pantalla y con ocho puntos', () => {
    const fixture = TestBed.createComponent(Celebrate);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.getAttribute('aria-hidden')).toBe('true');
    expect(host.querySelectorAll('.celebrate-dot').length).toBe(8);
    expect(host.querySelector('.celebrate-core')).not.toBeNull();
  });
});
