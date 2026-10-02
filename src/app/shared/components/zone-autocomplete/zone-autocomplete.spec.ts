import { describe, expect, it } from 'vitest';
import { matchZones, normalizeZoneText } from './zone-autocomplete';

const ZONES = [
  'Centro',
  'Villa Italia',
  'Uncas',
  'Villa Aguirre',
  'La Movediza',
  'El Tropezón',
  'Mirage',
  'Villa Laza',
  'Barrio Arco Iris (1era y 2da etapa)',
  'Las Tunitas',
  '17 de Agosto',
  'Don Bosco',
].map((name, i) => ({ id: `z${i}`, name }));
const names = (list: { name: string }[]) => list.map((z) => z.name);

describe('autocompletado de barrios', () => {
  it('ignora tildes, mayúsculas y signos', () => {
    expect(normalizeZoneText('El Tropezón')).toBe('el tropezon');
    expect(normalizeZoneText('Barrio Arco-iris (1era y 2da etapa)')).toBe('barrio arco iris 1era y 2da etapa');
  });

  it('sin texto ofrece todos, en su orden', () => {
    expect(matchZones(ZONES, '')).toHaveLength(ZONES.length);
    expect(names(matchZones(ZONES, '  ')).slice(0, 2)).toEqual(['Centro', 'Villa Italia']);
  });

  it('encuentra sin tilde y por cualquier palabra del nombre', () => {
    expect(names(matchZones(ZONES, 'tropezon'))).toEqual(['El Tropezón']);
    expect(names(matchZones(ZONES, 'arco iris'))).toEqual(['Barrio Arco Iris (1era y 2da etapa)']);
    expect(names(matchZones(ZONES, '17'))).toEqual(['17 de Agosto']);
    expect(names(matchZones(ZONES, 'bosco'))).toEqual(['Don Bosco']);
  });

  it('primero los que empiezan igual, después palabra, después contiene', () => {
    expect(names(matchZones(ZONES, 'vi'))).toEqual(['Villa Italia', 'Villa Aguirre', 'Villa Laza']);
    expect(names(matchZones(ZONES, 'la'))).toEqual([
      'La Movediza',
      'Las Tunitas',
      'Villa Laza',
      'Villa Italia',
      'Villa Aguirre',
    ]);
  });

  it('no repite lo ya elegido y sin coincidencias devuelve vacío', () => {
    expect(names(matchZones(ZONES, 'villa', ['z1']))).toEqual(['Villa Aguirre', 'Villa Laza']);
    expect(matchZones(ZONES, 'zzz')).toEqual([]);
  });
});
