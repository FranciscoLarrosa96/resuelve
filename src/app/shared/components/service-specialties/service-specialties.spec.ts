import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ServiceSpecialties } from '../../../core/models/pro-profile';
import { ServiceSpecialtiesEditor } from './service-specialties';

@Component({ imports: [ServiceSpecialtiesEditor], template: `<app-service-specialties [services]="services()" [(specialties)]="items" />` })
class Host {
  readonly services = signal([{ id: 'pc', name: 'Reparación de PC' }]);
  readonly items = signal<ServiceSpecialties[]>([]);
}

describe('editor de especialidades', () => {
  function setup() {
    const f = TestBed.createComponent(Host);
    f.detectChanges();
    const el: HTMLElement = f.nativeElement;
    const click = (text: string) => {
      [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.includes(text))!.click();
      f.detectChanges();
    };
    const type = (text: string) => {
      const input = el.querySelector<HTMLInputElement>('input')!;
      input.value = text;
      input.dispatchEvent(new Event('input'));
      f.detectChanges();
    };
    click('¿No encontrás');
    return { f, el, click, type };
  }

  it('agrega al rubro elegido, evita duplicados y permite quitar sin crear otro servicio', () => {
    const { f, el, click, type } = setup();
    type('Reparación de consolas');
    click('Agregar especialidad');
    expect(f.componentInstance.items()).toEqual([{ serviceId: 'pc', names: ['Reparación de consolas'] }]);
    type('Reparacion de consolas');
    click('Agregar especialidad');
    expect(el.querySelector('[role=alert]')?.textContent).toContain('Ya agregaste');
    el.querySelector<HTMLButtonElement>('[aria-label="Quitar Reparación de consolas"]')!.click();
    expect(f.componentInstance.items()[0].names).toEqual([]);
  });

  it('no permite contacto y explica cómo seguir sin rubro', () => {
    const { f, el, click, type } = setup();
    type('Escribime a hola@ejemplo.com');
    click('Agregar especialidad');
    expect(f.componentInstance.items()).toEqual([]);
    expect(el.querySelector('[role=alert]')?.textContent).toContain('No incluyas');
    f.componentInstance.services.set([]);
    f.detectChanges();
    expect(el.textContent).toContain('Primero elegí al menos un servicio');
    expect(el.querySelector('input')).toBeNull();
  });
});
