import { describe, expect, it } from 'vitest';
import { FALLBACK_SERVICE_ICON, SERVICE_ICONS, serviceIcon } from './service-icons';

describe('serviceIcon', () => {
  it('cada servicio del catálogo productivo tiene su ícono', () => {
    expect(serviceIcon('reparacion-de-pc')).toBe('monitor');
    expect(serviceIcon('plomeria')).toBe('droplets');
    expect(serviceIcon('mecanico-de-autos')).toBe('car');
    expect(serviceIcon('mecanico-de-motos')).toBe('motorbike');
    expect(serviceIcon('mecanico')).toBe('wrench');
    expect(Object.keys(SERVICE_ICONS)).toHaveLength(31);
  });

  it('servicio nuevo o vacío → ícono neutro, sin romper', () => {
    expect(serviceIcon('vidrieria')).toBe(FALLBACK_SERVICE_ICON);
    expect(serviceIcon('')).toBe(FALLBACK_SERVICE_ICON);
    expect(serviceIcon(null)).toBe(FALLBACK_SERVICE_ICON);
  });
});
