import { MAX_CAPTION_LENGTH, captionProblem, normalizeCaption, workPhotoFolder } from './work-photo-rules';

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
