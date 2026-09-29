import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { RequestLocationDto } from './request.dto';

function errors(value: Record<string, unknown>) {
  return validateSync(plainToInstance(RequestLocationDto, value));
}

describe('RequestLocationDto', () => {
  const valid = { latitude: -37.3211, longitude: -59.1401, propertyType: 'APARTMENT', floor: '3', unit: 'B' };

  it('acepta coordenadas numéricas válidas y valores opcionales de departamento', () => {
    expect(errors(valid)).toHaveLength(0);
  });

  it.each([
    ['latitud fuera de rango', { ...valid, latitude: -91 }],
    ['longitud fuera de rango', { ...valid, longitude: 181 }],
    ['latitud como texto', { ...valid, latitude: '-37.3' }],
    ['NaN', { ...valid, latitude: Number.NaN }],
    ['tipo de propiedad desconocido', { ...valid, propertyType: 'ROOM' }],
  ])('rechaza %s', (_label, value) => {
    expect(errors(value).length).toBeGreaterThan(0);
  });
});
