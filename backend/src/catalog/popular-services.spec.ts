import { selectPopularSlugs } from './popular-services';

describe('selectPopularSlugs', () => {
  it('sin volumen total no hay ranking', () => {
    expect(selectPopularSlugs([{ slug: 'gas', count: 19 }])).toEqual([]);
    expect(selectPopularSlugs([])).toEqual([]);
  });

  it('ordena por cantidad, desempata por slug y corta en 4', () => {
    const rows = [
      { slug: 'pintura', count: 5 },
      { slug: 'gas', count: 9 },
      { slug: 'cerrajeria', count: 5 },
      { slug: 'plomeria', count: 12 },
      { slug: 'albanileria', count: 3 },
    ];
    expect(selectPopularSlugs(rows)).toEqual(['plomeria', 'gas', 'cerrajeria', 'pintura']);
  });

  it('descarta servicios con muy pocos pedidos', () => {
    const rows = [
      { slug: 'plomeria', count: 20 },
      { slug: 'gas', count: 2 },
    ];
    expect(selectPopularSlugs(rows)).toEqual(['plomeria']);
  });
});
