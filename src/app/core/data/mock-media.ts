/**
 * Fotos de muestra para el prototipo.
 *
 * Es el único lugar que conoce el proveedor externo: cuando haya fotos reales
 * (subidas por cada profesional), se reemplaza esta función o se deja de usar.
 * Si la URL falla o no existe, `<app-avatar>` muestra las iniciales.
 */
const MOCK_PORTRAITS_BASE = 'https://randomuser.me/api/portraits';

export function mockPortrait(path: string): string {
  return `${MOCK_PORTRAITS_BASE}/${path}.jpg`;
}
