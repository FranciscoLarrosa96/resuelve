import { arrangeFeatured, openSlots, rotationKey } from './featured-placement';

const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`);
const opts = { maxSlots: 2, resultsPerSlot: 8, seed: '2026-09-26|plomeria|centro' };

describe('espacios destacados', () => {
  it('se abren con volumen: 0–1 resultado ninguno, hasta 8 uno, 9+ dos, nunca más que el máximo', () => {
    expect([0, 1, 2, 8, 9, 16, 40].map((n) => openSlots(n, opts))).toEqual([0, 0, 1, 1, 2, 2, 2]);
    expect(openSlots(40, { ...opts, maxSlots: 0 })).toBe(0);
  });

  it('sin PRO elegibles, el orden orgánico no cambia', () => {
    const organic = ids(10);
    const r = arrangeFeatured(organic, new Set(), opts);
    expect(r.ids).toEqual(organic);
    expect(r.featured.size).toBe(0);
  });

  it('el PRO sube al primer espacio; nadie desaparece ni se duplica', () => {
    const organic = ids(6);
    const r = arrangeFeatured(organic, new Set(['p4']), opts);
    expect(r.ids).toEqual(['p4', 'p0', 'p1', 'p2', 'p3', 'p5']);
    expect([...r.featured]).toEqual(['p4']);
  });

  it('nunca destaca hacia abajo: el PRO que ya está primero queda orgánico', () => {
    const r = arrangeFeatured(ids(6), new Set(['p0']), opts);
    expect(r.ids).toEqual(ids(6));
    expect(r.featured.size).toBe(0);
  });

  it('con volumen, el 2.º espacio va 5 lugares más abajo y los FREE conservan su orden relativo', () => {
    const organic = ids(12);
    const r = arrangeFeatured(organic, new Set(['p9', 'p11']), opts);
    expect(r.featured).toEqual(new Set(['p9', 'p11']));
    expect(r.ids).toHaveLength(12);
    const free = r.ids.filter((id) => !r.featured.has(id));
    expect(free).toEqual(organic.filter((id) => !r.featured.has(id)));
    expect(r.featured.has(r.ids[0]) && r.featured.has(r.ids[5])).toBe(true);
  });

  it('rota entre PRO elegibles según la semilla (día + búsqueda) y es estable para la misma semilla', () => {
    const organic = ids(8);
    const eligible = new Set(['p3', 'p4', 'p5', 'p6', 'p7']);
    const first = (seed: string) => arrangeFeatured(organic, eligible, { ...opts, seed }).ids[0];
    expect(first('2026-09-26|a')).toBe(first('2026-09-26|a'));
    const winners = new Set(Array.from({ length: 30 }, (_, d) => first(`2026-09-${d}|a`)));
    expect(winners.size).toBeGreaterThan(1);
    expect(rotationKey('s', 'x')).toMatch(/^[0-9a-f]{64}$/);
  });
});
