import { isJunkComment, looksLikeQaEmail, looksLikeQaText } from './launch-audit';

describe('auditoría de datos de QA antes del lanzamiento', () => {
  it.each(['PROFESIONAL TEST1', 'TEST TEST', 'Cuenta de prueba', 'QA plomero', 'dummy', 'Lorem ipsum'])(
    'detecta texto de QA: %s',
    (text) => expect(looksLikeQaText(text)).toBe(true),
  );

  it.each(['Carlos Fernández', 'Electricista matriculado', 'Testa Ferro', 'Plomería en Tandil', null, ''])(
    'no marca texto real: %s',
    (text) => expect(looksLikeQaText(text)).toBe(false),
  );

  it('detecta dominios de cuentas de prueba, no emails reales', () => {
    expect(looksLikeQaEmail('maria@resuelve.dev')).toBe(true);
    expect(looksLikeQaEmail('x@test.dev')).toBe(true);
    expect(looksLikeQaEmail('ana@gmail.com')).toBe(false);
  });

  it.each(['qwe', 'qweqweqwe', '123123123', 'aaaa', 'asdasd', 'x', 'ok'])('reseña basura: %s', (comment) =>
    expect(isJunkComment(comment)).toBe(true),
  );

  it.each([
    'Muy prolijo y puntual, lo recomiendo.',
    'Resolvió el problema el mismo día.',
    'Excelente trabajo',
    null,
    '',
  ])('reseña real: %s', (comment) => expect(isJunkComment(comment)).toBe(false));
});
