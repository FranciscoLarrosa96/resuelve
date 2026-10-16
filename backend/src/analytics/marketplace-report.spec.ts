import { formatDuration, percentOf, rowLabel } from './marketplace-report';

describe('reporte del marketplace: formato', () => {
  it('porcentaje con un decimal y sin denominador no inventa', () => {
    expect(percentOf(2, 3)).toBe(66.7);
    expect(percentOf(3, 5)).toBe(60);
    expect(percentOf(0, 4)).toBe(0);
    expect(percentOf(0, 0)).toBeNull();
  });

  it('duración legible', () => {
    expect(formatDuration(null)).toBe('sin dato');
    expect(formatDuration(25)).toBe('25 min');
    expect(formatDuration(60)).toBe('1 h');
    expect(formatDuration(95)).toBe('1 h 35 min');
  });

  it('rótulos de modo y urgencia', () => {
    expect(rowLabel({ mode: null, urgency: null })).toBe('Todos los pedidos');
    expect(rowLabel({ mode: 'DISCOVERY', urgency: 'URGENT' })).toBe('Búsqueda · urgente');
    expect(rowLabel({ mode: 'DIRECTED', urgency: null })).toBe('Dirigido · toda urgencia');
  });
});
