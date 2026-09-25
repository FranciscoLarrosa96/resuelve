import { computeQuoteAmounts } from './quote-totals';

describe('computeQuoteAmounts', () => {
  it('suma mano de obra + materiales', () => {
    expect(computeQuoteAmounts({ laborAmount: 38000, materialsAmount: 12500 })).toEqual({
      laborAmount: '38000.00',
      materialsAmount: '12500.00',
      totalAmount: '50500.00',
    });
  });

  it('con ítems, los materiales son la suma de los ítems (ignora materialsAmount)', () => {
    const amounts = computeQuoteAmounts({
      laborAmount: '20000',
      materialsAmount: 999999,
      items: [
        { quantity: 2, unitPrice: '4500.50' },
        { quantity: '1.5', unitPrice: 1000 },
      ],
    });
    expect(amounts.materialsAmount).toBe('10501.00');
    expect(amounts.totalAmount).toBe('30501.00');
  });

  it('no acumula error de coma flotante', () => {
    const amounts = computeQuoteAmounts({ laborAmount: 0.1, items: [{ quantity: 3, unitPrice: 0.1 }] });
    expect(amounts.totalAmount).toBe('0.40');
  });
});
