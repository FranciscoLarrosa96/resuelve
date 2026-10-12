import {
  FREE_WORK_LIMIT,
  MAX_CAPTION_LENGTH,
  PHOTOS_PER_WORK,
  PRO_WORK_LIMIT,
  captionProblem,
  dateToWorkMonth,
  normalizeCaption,
  workDescriptionProblem,
  workMonthProblem,
  workMonthToDate,
  workPhotoFolder,
  workTitleProblem,
} from './work-photo-rules';

describe('reglas de "Trabajos realizados"', () => {
  it('carpeta pública separada de avatares y matrículas', () => {
    expect(workPhotoFolder('abc')).toBe('resuelve/professional-work/abc');
  });

  it('normaliza la descripción a una línea; vacía = null', () => {
    expect(normalizeCaption('  Baño\n\tcompleto  ')).toBe('Baño completo');
    expect(normalizeCaption('   ')).toBeNull();
    expect(normalizeCaption(undefined)).toBeNull();
  });

  it('hasta 80 caracteres, sin teléfonos ni emails', () => {
    expect(captionProblem(null)).toBeNull();
    expect(captionProblem('x'.repeat(MAX_CAPTION_LENGTH))).toBeNull();
    expect(captionProblem('x'.repeat(MAX_CAPTION_LENGTH + 1))).toMatch(/80/);
    expect(captionProblem('Llamame 2494 44-5566')).toMatch(/teléfonos/);
    expect(captionProblem('+54 9 249 444 5566')).toMatch(/teléfonos/);
    expect(captionProblem('mail: juan@gmail.com')).toMatch(/emails/);
    // Medidas y años no son teléfonos.
    expect(captionProblem('Cocina 2024, mesada de 2,40 m')).toBeNull();
    expect(captionProblem('Tablero de 12 circuitos y 3 térmicas de 20 A')).toBeNull();
  });
});

describe('reglas de un trabajo', () => {
  const now = new Date('2026-10-12T15:00:00Z');

  it('Free 1 trabajo, PRO 10; 5 fotos por trabajo en los dos planes', () => {
    expect([FREE_WORK_LIMIT, PRO_WORK_LIMIT, PHOTOS_PER_WORK]).toEqual([1, 10, 5]);
  });

  it('nombre obligatorio de 2 a 60 caracteres, sin teléfonos ni emails', () => {
    expect(workTitleProblem('Casa 1')).toBeNull();
    expect(workTitleProblem(null)).toMatch(/nombre/);
    expect(workTitleProblem('x')).toMatch(/nombre/);
    expect(workTitleProblem('x'.repeat(61))).toMatch(/60/);
    expect(workTitleProblem('Casa 249 444-5566')).toMatch(/teléfonos en el nombre/);
  });

  it('descripción opcional de hasta 160 caracteres', () => {
    expect(workDescriptionProblem(null)).toBeNull();
    expect(workDescriptionProblem('x'.repeat(160))).toBeNull();
    expect(workDescriptionProblem('x'.repeat(161))).toMatch(/160/);
    expect(workDescriptionProblem('juan@gmail.com')).toMatch(/emails en la descripción/);
  });

  it('mes y año, desde 1980 y nunca en el futuro (mes de Argentina)', () => {
    expect(workMonthProblem('2026-10', now)).toBeNull();
    expect(workMonthProblem('1980-01', now)).toBeNull();
    expect(workMonthProblem('2026-11', now)).toMatch(/futura/);
    expect(workMonthProblem('1979-12', now)).toMatch(/mes y el año/);
    expect(workMonthProblem('2026-13', now)).toMatch(/mes y el año/);
    expect(workMonthProblem('2026-3', now)).toMatch(/mes y el año/);
    // 1 de noviembre 01:00 UTC = 31 de octubre en Argentina: noviembre todavía es futuro.
    expect(workMonthProblem('2026-11', new Date('2026-11-01T01:00:00Z'))).toMatch(/futura/);
  });

  it('mes ↔ fecha', () => {
    expect(workMonthToDate('2026-03')).toBe('2026-03-01');
    expect(dateToWorkMonth('2026-03-01')).toBe('2026-03');
    expect(dateToWorkMonth(new Date(2026, 2, 1))).toBe('2026-03');
  });
});
