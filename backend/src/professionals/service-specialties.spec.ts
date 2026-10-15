import { normalizeSpecialties } from './service-specialties';

describe('especialidades de los servicios', () => {
  it('normaliza texto y permite quitar las especialidades sin quitar el rubro', () => {
    expect(normalizeSpecialties([{ serviceId: 'pc', names: ['  Reparación   de consolas  '] }], ['pc']).get('pc'))
      .toEqual(['Reparación de consolas']);
    expect(normalizeSpecialties([{ serviceId: 'pc', names: [] }], ['pc']).get('pc')).toEqual([]);
  });

  it('no acepta especialidades en un servicio que no ofrece, ni rubros duplicados', () => {
    expect(() => normalizeSpecialties([{ serviceId: 'gas', names: ['Calderas'] }], ['pc'])).toThrow();
    expect(() => normalizeSpecialties([{ serviceId: 'pc', names: [] }, { serviceId: 'pc', names: [] }], ['pc'])).toThrow();
  });

  it.each([
    [''], ['a'], ['x'.repeat(61)], ['Consolas', 'Cónsolas'], ['WhatsApp 249 154123456'], ['hola@ejemplo.com'],
    ['https://ejemplo.com'], ['www.ejemplo.com'], ['a', 'b', 'c', 'd', 'e', 'f'],
  ])('rechaza texto inválido o contacto: %j', (...names: string[]) => {
    expect(() => normalizeSpecialties([{ serviceId: 'pc', names }], ['pc'])).toThrow();
  });
});
