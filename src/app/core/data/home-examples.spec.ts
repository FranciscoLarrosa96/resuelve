import { REQUEST_EXAMPLES, homeExamples } from './catalog.data';

describe('homeExamples', () => {
  it('sin "más pedidos" usa la lista fija', () => {
    expect(homeExamples([])).toEqual(REQUEST_EXAMPLES.slice(0, 4));
  });

  it('pone primero los ejemplos de los servicios más pedidos y completa con la lista fija', () => {
    const result = homeExamples(['pintura', 'albanileria']);
    expect(result).toHaveLength(4);
    expect(result.slice(0, 2)).toEqual(['Quiero pintar dos habitaciones', 'Tengo humedad en una pared']);
    expect(new Set(result).size).toBe(4);
  });

  it('ignora servicios sin ejemplo y no repite', () => {
    expect(homeExamples(['jardineria', 'plomeria'])[0]).toBe('Me pierde agua abajo de la pileta');
    expect(homeExamples(['jardineria'])).toEqual(REQUEST_EXAMPLES.slice(0, 4));
  });
});
