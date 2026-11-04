import { QUOTE_PDF_LEGAL, quotePdf, quotePdfModel } from './quote-pdf';
import { Quote } from './quote.entity';

const quote = (over: Partial<Quote> = {}) =>
  ({
    id: '3776ae22-aaaa-bbbb-cccc-000000000000',
    createdAt: new Date('2026-10-08T15:00:00Z'),
    validUntil: new Date('2026-10-15T15:00:00Z'),
    estimatedDuration: null,
    note: null,
    items: [],
    laborAmount: '20000',
    materialsAmount: '20000',
    totalAmount: '40000',
    description: 'Cambio de canilla',
    professional: { headline: 'Plomería', user: { firstName: 'María José', lastName: 'Fernández' } },
    ...over,
  }) as unknown as Quote;
const none = { licenseVerified: false, rating: null, reviewsCount: 0, profileUrl: null };

describe('Presupuesto en PDF', () => {
  it('arma el contenido con los datos reales del presupuesto', () => {
    const m = quotePdfModel(
      quote({
        estimatedDuration: '2 días',
        note: 'Se trabaja de 8 a 17.',
        items: [
          { description: 'Llave', quantity: '1.5', unitPrice: '1000', sortOrder: 2 },
          { description: 'Canilla', quantity: '2', unitPrice: '12500.5', sortOrder: 1 },
        ] as Quote['items'],
      }),
      none,
    );
    expect(m.reference).toBe('3776AE22');
    expect(m.professional).toEqual({ name: 'María José Fernández', initials: 'MJ', headline: 'Plomería' });
    expect(m.rows.map((r) => r.description)).toEqual(['Canilla', 'Llave']);
    expect(m.rows[0].subtotal.replace(/\s/g, ' ')).toBe('$ 25.001,00');
    expect(m.rows[1].quantity).toBe('1,5');
    expect(m.subtotals.map((s) => s.label)).toEqual(['Mano de obra', 'Materiales']);
    expect(m.total.replace(/\s/g, ' ')).toBe('$ 40.000,00');
    expect(m.facts).toEqual([
      { label: 'Válido hasta', value: '15/10/2026' },
      { label: 'Duración estimada', value: '2 días' },
    ]);
    expect(m.note).toBe('Se trabaja de 8 a 17.');
    expect(m.legal).toBe(QUOTE_PDF_LEGAL);
  });

  it('solo muestra matrícula, puntaje y perfil cuando son reales', () => {
    const empty = quotePdfModel(quote(), none);
    expect(empty.badges).toEqual({ license: false, rating: null });
    expect(empty.profileUrl).toBeNull();
    // Puntaje sin reseñas por Resuelve: no se muestra (nunca "0").
    expect(quotePdfModel(quote(), { ...none, rating: 0, reviewsCount: 0 }).badges.rating).toBeNull();

    const full = quotePdfModel(quote(), { licenseVerified: true, rating: 4.8, reviewsCount: 1, profileUrl: 'https://resuelve.com.ar/p/mj' });
    expect(full.badges).toEqual({ license: true, rating: '4,8 · 1 reseña en Resuelve' });
    expect(full.profileUrl).toBe('https://resuelve.com.ar/p/mj');
  });

  it('limpia caracteres de control y no inventa campos vacíos', () => {
    const m = quotePdfModel(quote({ description: 'Hola\u0007 mundo 🙂', validUntil: null }), none);
    expect(m.description).toBe('Hola mundo ');
    expect(m.facts).toEqual([]);
    expect(m.note).toBeNull();
    expect(m.rows).toEqual([]);
  });

  it('genera un PDF válido, también con muchos conceptos en varias páginas', async () => {
    const items = Array.from({ length: 40 }, (_, i) => ({ description: `Material ${i + 1}`, quantity: '1', unitPrice: '100', sortOrder: i }));
    const short = await quotePdf(quote(), none);
    const long = await quotePdf(quote({ items: items as Quote['items'], note: 'Nota' }), { ...none, profileUrl: 'https://resuelve.com.ar/p/mj' });
    for (const pdf of [short, long]) expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    const pages = (pdf: Buffer) => (pdf.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length;
    expect(pages(short)).toBe(1);
    expect(pages(long)).toBeGreaterThan(1);
  });
});
