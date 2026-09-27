import { describe, expect, it } from 'vitest';
import { FALLBACK_SERVICE_ICON, SERVICE_ICONS, serviceIcon } from './service-icons';

describe('serviceIcon', () => {
  it('cada servicio del catálogo productivo tiene su ícono', () => {
    expect(serviceIcon('reparacion-de-pc')).toBe('monitor');
    expect(serviceIcon('plomeria')).toBe('droplets');
    expect(Object.keys(SERVICE_ICONS)).toHaveLength(20);
  });

  it('servicio nuevo o vacío → ícono neutro, sin romper', () => {
    expect(serviceIcon('vidrieria')).toBe(FALLBACK_SERVICE_ICON);
    expect(serviceIcon('')).toBe(FALLBACK_SERVICE_ICON);
    expect(serviceIcon(null)).toBe(FALLBACK_SERVICE_ICON);
  });
});
