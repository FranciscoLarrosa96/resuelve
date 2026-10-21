import { founderAwarePrice, founderSlots } from './founder-price';

const config = (slots?: number) => ({ get: (_k: string, d: unknown) => slots ?? d }) as never;

describe('precio fundador', () => {
  it('compra nueva: el menor entre el precio fundador y el vigente', () => {
    expect(founderAwarePrice(15000, 9900)).toBe(9900);
    expect(founderAwarePrice(8000, 9900)).toBe(8000);
    expect(founderAwarePrice(9900, null)).toBe(9900);
    expect(founderAwarePrice(9900, undefined)).toBe(9900);
  });

  it('lugares: 30 por defecto, 0 lo apaga, nunca negativo', () => {
    expect(founderSlots(config())).toBe(30);
    expect(founderSlots(config(0))).toBe(0);
    expect(founderSlots(config(-3))).toBe(0);
  });
});
