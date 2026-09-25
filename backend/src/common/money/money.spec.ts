import { fromCents, multiplyCents, toCents } from './money';

describe('money', () => {
  it('convierte sin errores de coma flotante', () => {
    expect(toCents('0.1') + toCents('0.2')).toBe(30);
    expect(fromCents(toCents('0.1') + toCents('0.2'))).toBe('0.30');
    expect(toCents(52000)).toBe(5_200_000);
    expect(toCents('38000.5')).toBe(3_800_050);
    expect(fromCents(3_800_050)).toBe('38000.50');
  });

  it('rechaza montos con más de dos decimales o basura', () => {
    expect(() => toCents('10.001')).toThrow();
    expect(() => toCents('abc')).toThrow();
    expect(() => toCents('1e5')).toThrow();
  });

  it('multiplica cantidad por precio redondeando a centavos', () => {
    expect(multiplyCents(toCents('1250.00'), 3)).toBe(375_000);
    expect(multiplyCents(toCents('99.99'), '1.5')).toBe(14_999); // 149.985 → 149.99
  });
});
