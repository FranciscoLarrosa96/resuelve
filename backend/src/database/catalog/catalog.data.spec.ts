import { CATALOG_CATEGORIES, CATALOG_CITIES } from './catalog.data';

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

describe('catálogo productivo (datos)', () => {
  const services = CATALOG_CATEGORIES.flatMap((c) => c.services);

  it('tiene slugs estables, en kebab-case y sin repetir', () => {
    const slugs = [
      ...CATALOG_CITIES.map((c) => c.slug),
      ...CATALOG_CATEGORIES.map((c) => c.slug),
      ...services.map((s) => s.slug),
    ];
    for (const slug of slugs) expect(slug).toMatch(SLUG);
    expect(new Set(CATALOG_CATEGORIES.map((c) => c.slug)).size).toBe(CATALOG_CATEGORIES.length);
    expect(new Set(services.map((s) => s.slug)).size).toBe(services.length);
    for (const city of CATALOG_CITIES) {
      expect(new Set(city.zones.map((z) => z.slug)).size).toBe(city.zones.length);
      for (const zone of city.zones) expect(zone.slug).toMatch(SLUG);
    }
  });

  it('Gas y Electricidad requieren matrícula; el resto no', () => {
    const licensed = services
      .filter((s) => s.requiresLicense)
      .map((s) => s.slug)
      .sort();
    expect(licensed).toEqual(['electricidad', 'gas']);
  });

  it('Tandil incluye los barrios que usa el frontend', () => {
    const tandil = CATALOG_CITIES.find((c) => c.slug === 'tandil')!;
    expect(tandil.province).toBe('Buenos Aires');
    expect(tandil.zones.map((z) => z.name)).toEqual([
      'Centro',
      'Villa Italia',
      'Uncas',
      'Villa Aguirre',
      'La Movediza',
    ]);
  });
});
