import { describe, expect, it } from 'vitest';
import { interpretRequest, scoreServices } from './interpret-request';

/** El catálogo productivo del backend (slugs + nombres), en su orden: Electricidad primero, Plomería tercero. */
const CATALOG = [
  ['electricidad', 'Electricidad'],
  ['gas', 'Gas'],
  ['plomeria', 'Plomería'],
  ['cerrajeria', 'Cerrajería'],
  ['aire-acondicionado', 'Aire acondicionado'],
  ['pintura', 'Pintura'],
  ['albanileria', 'Albañilería'],
  ['carpinteria', 'Carpintería'],
  ['herreria', 'Herrería'],
  ['reparacion-de-electrodomesticos', 'Reparación de electrodomésticos'],
  ['corte-de-pasto', 'Corte de pasto'],
  ['jardineria', 'Jardinería'],
  ['poda', 'Poda'],
  ['limpieza-de-terrenos', 'Limpieza de terrenos'],
  ['fletes', 'Fletes'],
  ['mudanzas', 'Mudanzas'],
  ['retiro-de-muebles', 'Retiro de muebles'],
  ['camaras-y-alarmas', 'Cámaras y alarmas'],
  ['redes', 'Redes'],
  ['reparacion-de-pc', 'Reparación de PC'],
].map(([slug, name]) => ({ slug, name }));

const slugOf = (text: string) => {
  const r = interpretRequest(text, CATALOG);
  return r.kind === 'match' ? r.serviceSlug : null;
};

describe('interpretRequest', () => {
  it('"PC" → Reparación de PC (nunca Plomería)', () => {
    expect(slugOf('PC')).toBe('reparacion-de-pc');
    expect(slugOf('pc')).toBe('reparacion-de-pc');
    expect(slugOf('Mi PC no prende')).toBe('reparacion-de-pc');
  });

  it('notebook, computadora, formatear → Reparación de PC', () => {
    for (const t of ['notebook', 'Computadora lenta', 'formatear pc', 'necesito reparar pc', 'laptop', 'Computación']) {
      expect(slugOf(t)).toBe('reparacion-de-pc');
    }
  });

  it('frases típicas de cada rubro', () => {
    expect(slugOf('pierde agua')).toBe('plomeria');
    expect(slugOf('me quedé afuera')).toBe('cerrajeria');
    expect(slugOf('salta la térmica')).toBe('electricidad');
    expect(slugOf('Saltan las térmicas con el horno')).toBe('electricidad');
    expect(slugOf('Hay que destapar la cloaca')).toBe('plomeria');
    expect(slugOf('Necesito un gasista matriculado')).toBe('gas');
    expect(slugOf('Quiero pintar dos habitaciones')).toBe('pintura');
    expect(slugOf('No anda el wifi')).toBe('redes');
    expect(slugOf('Se rompió el lavarropas')).toBe('reparacion-de-electrodomesticos');
  });

  it('título específico cuando lo describe', () => {
    const r = interpretRequest('El termotanque pierde agua', CATALOG);
    expect(r).toEqual({ kind: 'match', serviceSlug: 'plomeria', problem: 'Termotanque con pérdida' });
  });

  it('texto sin coincidencia → no auto-selecciona ningún servicio (y menos el primero)', () => {
    expect(interpretRequest('hola necesito ayuda', CATALOG)).toEqual({ kind: 'uncertain', options: [] });
    expect(interpretRequest('asdfgh', CATALOG)).toEqual({ kind: 'uncertain', options: [] });
    expect(interpretRequest('', CATALOG)).toEqual({ kind: 'uncertain', options: [] });
  });

  it('coincidencia débil o empate → opciones reales, sin elegir', () => {
    // "agua" sola no alcanza para afirmar Plomería.
    expect(interpretRequest('agua', CATALOG)).toEqual({ kind: 'uncertain', options: ['plomeria'] });
    // "puerta" sola: Cerrajería como opción, no como certeza.
    expect(interpretRequest('la puerta', CATALOG)).toEqual({ kind: 'uncertain', options: ['cerrajeria'] });
    // Empate fuerte entre dos rubros: se ofrecen los dos.
    const tie = interpretRequest('cámaras y wifi', CATALOG);
    expect(tie.kind).toBe('uncertain');
    expect(tie.kind === 'uncertain' && [...tie.options].sort()).toEqual(['camaras-y-alarmas', 'redes']);
  });

  it('palabras completas: "toma" o "agua" dentro de otra palabra no suman', () => {
    expect(scoreServices('automático', CATALOG)).toEqual([]);
    expect(scoreServices('paraguas', CATALOG)).toEqual([]);
  });

  it('solo propone servicios que existen en el catálogo recibido', () => {
    const small = CATALOG.filter((c) => c.slug !== 'reparacion-de-pc');
    expect(interpretRequest('PC', small)).toEqual({ kind: 'uncertain', options: [] });
  });

  it('un servicio nuevo sin vocabulario se encuentra por su nombre', () => {
    expect(slugOf.call(null, 'x')).toBeNull();
    const withNew = [...CATALOG, { slug: 'vidrieria', name: 'Vidriería' }];
    expect(interpretRequest('vidriería urgente', withNew)).toMatchObject({ kind: 'match', serviceSlug: 'vidrieria' });
  });
});
