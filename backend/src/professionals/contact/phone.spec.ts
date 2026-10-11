import { formatPhone, normalizePhone, phoneKindOf, telLink, whatsappLink } from './phone';

const e164 = (input: string, kind: 'MOBILE' | 'LANDLINE' = 'MOBILE') => {
  const r = normalizePhone(input, kind);
  return 'e164' in r ? r.e164 : r.problem;
};

describe('normalizePhone: teléfonos argentinos e internacionales', () => {
  it.each([
    ['+54 9 249 412-3456', '+5492494123456'],
    ['+54 249 15 412-3456', '+5492494123456'],
    ['0249 15 412-3456', '+5492494123456'],
    ['249 15 4123456', '+5492494123456'],
    ['(011) 15-1234-5678', '+5491112345678'],
    ['11 1234 5678', '+5491112345678'],
    ['5492494123456', '+5492494123456'],
    ['0054 9 249 412 3456', '+5492494123456'],
    ['+54 9 249 15 412 3456', '+5492494123456'],
    ['2983 15 412345', '+5492983412345'],
  ])('celular %s → %s', (input, expected) => {
    expect(e164(input)).toBe(expected);
  });

  it('un número sin 9 ni 15 es celular o fijo según lo que elija el profesional', () => {
    expect(e164('2494423456', 'MOBILE')).toBe('+5492494423456');
    expect(e164('(0249) 442-3456', 'LANDLINE')).toBe('+542494423456');
    expect(e164('+54 249 442 3456', 'LANDLINE')).toBe('+542494423456');
    // Escrito explícitamente como celular, es celular aunque diga fijo.
    expect(e164('249 15 412 3456', 'LANDLINE')).toBe('+5492494123456');
  });

  it('acepta números de otros países con +', () => {
    expect(e164('+598 99 123 456')).toBe('+59899123456');
    expect(e164('+1 (415) 555-2671')).toBe('+14155552671');
  });

  it.each([
    ['', 'EMPTY'],
    ['   ', 'EMPTY'],
    ['4123456', 'INVALID'], // falta la característica
    ['15 412 3456', 'INVALID'],
    ['0800 222 1234', 'INVALID'], // no es un número de una persona
    ['249 412 34567 8', 'INVALID'],
    ['llamame al 249 4123456', 'INVALID'],
    ['+12', 'INVALID'],
    ['+1234567890123456', 'INVALID'],
  ])('rechaza %p (%s)', (input, problem) => {
    expect(e164(input)).toBe(problem);
  });
});

describe('enlaces y formato', () => {
  it('WhatsApp en formato internacional sin "+", con el saludo sugerido', () => {
    expect(whatsappLink('+5492494123456')).toBe(
      'https://wa.me/5492494123456?text=%C2%A1Hola!%20Te%20encontr%C3%A9%20en%20Resuelve%20y%20quer%C3%ADa%20consultarte%20por%20un%20trabajo.',
    );
  });

  it('tel: con el número completo', () => {
    expect(telLink('+542494423456')).toBe('tel:+542494423456');
  });

  it('se muestra legible y se sabe si es fijo', () => {
    expect(formatPhone('+5492494123456')).toBe('+54 9 249 412-3456');
    expect(formatPhone('+5491112345678')).toBe('+54 9 11 1234-5678');
    expect(formatPhone('+542494423456')).toBe('+54 249 442-3456');
    expect(formatPhone('+59899123456')).toBe('+59899123456');
    expect(phoneKindOf('+542494423456')).toBe('LANDLINE');
    expect(phoneKindOf('+5492494123456')).toBe('MOBILE');
    expect(phoneKindOf('+59899123456')).toBe('MOBILE');
  });
});
