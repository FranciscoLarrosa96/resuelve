import { readFileSync } from 'fs';
import { join } from 'path';
import { geoSlug, normalizeGeoText, searchPrefix } from './geo-text';
import { parseGeorefCensusLocalities, planSlugs } from './georef';

const sample = () =>
  JSON.parse(
    readFileSync(
      join(__dirname, '..', '..', '..', 'test', 'fixtures', 'georef-localidades-censales.sample.json'),
      'utf8',
    ),
  );

describe('texto geográfico', () => {
  it('sin tildes, mayúsculas ni signos', () => {
    expect(normalizeGeoText('Olavarría')).toBe('olavarria');
    expect(normalizeGeoText('  MAR DEL PLATA ')).toBe('mar del plata');
    expect(normalizeGeoText('Villa Bolaños (Médano de Oro)')).toBe('villa bolanos medano de oro');
    expect(geoSlug('Villa General San Martín - Campo Afuera')).toBe('villa-general-san-martin-campo-afuera');
    expect(searchPrefix('Ñorquincó%_')).toBe('norquinco');
  });
});

describe('Georef: localidades censales', () => {
  it('lee el formato oficial y descarta entradas inválidas o repetidas', () => {
    const raw = sample();
    const { items, skipped } = parseGeorefCensusLocalities(raw);
    expect(items.length).toBe(raw.localidades_censales.length);
    expect(skipped).toBe(0);
    expect(items.find((i) => i.officialCode === '70028010')).toMatchObject({
      name: 'San Juan',
      provinceCode: '70',
      departmentName: 'Capital',
    });
    const bad = parseGeorefCensusLocalities([
      { id: 'x', nombre: 'Sin código' },
      { id: '70028010', nombre: '' },
      raw.localidades_censales[0],
      raw.localidades_censales[0],
    ]);
    expect(bad).toMatchObject({ skipped: 3 });
    expect(() => parseGeorefCensusLocalities({})).toThrow();
  });

  it('homónimos en la misma provincia: todos llevan el departamento; slugs únicos y estables', () => {
    const { items } = parseGeorefCensusLocalities(sample());
    const slugs = planSlugs(items, new Map());
    expect(slugs.get('70007010')).toBe('el-rincon-albardon');
    expect(slugs.get('70035030')).toBe('el-rincon-caucete');
    expect(slugs.get('70028010')).toBe('san-juan');
    expect(new Set(slugs.values()).size).toBe(items.length);
    // Mismo resultado en otra corrida (orden por código oficial).
    expect(planSlugs([...items].reverse(), new Map())).toEqual(slugs);
    // Un slug ya publicado no se reutiliza: el nuevo lleva el código oficial.
    const taken = new Map([['70', new Set(['san-juan'])]]);
    expect(planSlugs(items, taken).get('70028010')).toBe('san-juan-70028010');
  });
});
