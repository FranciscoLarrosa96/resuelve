import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { ProfessionalServiceChips } from './professional-service-chips';

const svc = (slug: string, name: string) => ({ id: `id-${slug}`, name, slug });

@Component({
  imports: [ProfessionalServiceChips],
  template: `<app-professional-service-chips [services]="services()" [matchServiceId]="match()" />`,
})
class Host {
  readonly services = signal([
    svc('electricidad', 'Electricidad'),
    svc('redes', 'Redes'),
    svc('reparacion-de-pc', 'Reparación de PC'),
    svc('servicio-nuevo', 'Servicio nuevo'),
    svc('gas', 'Gas'),
  ]);
  readonly match = signal<string | null>(null);
}

describe('ProfessionalServiceChips', () => {
  function setup() {
    const f = TestBed.createComponent(Host);
    f.detectChanges();
    const el: HTMLElement = f.nativeElement;
    const names = () => [...el.querySelectorAll('[data-testid=service-chip] .service-chip-name')].map((n) => n.textContent);
    return { f, el, names };
  }

  it('muestra dos chips con ícono decorativo y +3 con los nombres para lectores', () => {
    const { el, names } = setup();
    expect(names()).toEqual(['Electricidad', 'Redes']);
    expect(el.querySelectorAll('[data-testid=service-chip] app-service-icon[aria-hidden=true] svg')).toHaveLength(2);
    const more = el.querySelector('[data-testid=service-chip-more]')!;
    expect(more.querySelector('[aria-hidden=true]')?.textContent).toBe('+3');
    expect(more.querySelector('.sr-only')?.textContent).toContain('Reparación de PC, Servicio nuevo, Gas');
    expect(el.querySelector('button, a')).toBeNull();
  });

  it('el servicio buscado aparece primero', () => {
    const { f, names } = setup();
    f.componentInstance.match.set('id-reparacion-de-pc');
    f.detectChanges();
    expect(names()).toEqual(['Reparación de PC', 'Electricidad']);
  });

  it('servicio sin ícono usa el neutro y sin servicios no renderiza nada', () => {
    const { f, el } = setup();
    f.componentInstance.services.set([svc('servicio-nuevo', 'Servicio nuevo')]);
    f.detectChanges();
    expect(el.querySelector('[data-testid=service-chip] svg path')).not.toBeNull();
    expect(el.querySelector('[data-testid=service-chip-more]')).toBeNull();
    f.componentInstance.services.set([]);
    f.detectChanges();
    expect(el.querySelector('[data-testid=service-chip]')).toBeNull();
  });
});
