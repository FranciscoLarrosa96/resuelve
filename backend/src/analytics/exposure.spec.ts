import { ExposureEventType } from './exposure-event.entity';
import { exposureDedupeKey, PROFILE_VIEW_WINDOW_MS, ratio } from './exposure';

const base = {
  type: ExposureEventType.SEARCH_IMPRESSION,
  professionalId: 'p1',
  serviceId: 's1',
  zoneId: 'z1',
  isUrgent: false,
  page: 1,
};

describe('deduplicación de exposición', () => {
  it('misma aparición en la misma sesión = misma clave (rerender o reintento no suma)', () => {
    expect(exposureDedupeKey(base, 'h1')).toBe(exposureDedupeKey({ ...base }, 'h1'));
  });

  it('otro contexto de búsqueda, página, sesión o profesional = otra aparición', () => {
    const k = exposureDedupeKey(base, 'h1');
    expect(exposureDedupeKey({ ...base, zoneId: 'z2' }, 'h1')).not.toBe(k);
    expect(exposureDedupeKey({ ...base, serviceId: null }, 'h1')).not.toBe(k);
    expect(exposureDedupeKey({ ...base, isUrgent: true }, 'h1')).not.toBe(k);
    expect(exposureDedupeKey({ ...base, page: 2 }, 'h1')).not.toBe(k);
    expect(exposureDedupeKey(base, 'h2')).not.toBe(k);
    expect(exposureDedupeKey({ ...base, professionalId: 'p2' }, 'h1')).not.toBe(k);
  });

  it('visita al perfil: una por sesión cada 30 minutos', () => {
    const view = { ...base, type: ExposureEventType.PROFILE_VIEW, serviceId: null, zoneId: null, page: null };
    const t0 = new Date(Math.ceil(Date.now() / PROFILE_VIEW_WINDOW_MS) * PROFILE_VIEW_WINDOW_MS);
    const k = exposureDedupeKey(view, 'h1', t0);
    expect(exposureDedupeKey(view, 'h1', new Date(t0.getTime() + 29 * 60_000))).toBe(k);
    expect(exposureDedupeKey(view, 'h1', new Date(t0.getTime() + 30 * 60_000))).not.toBe(k);
  });

  it('las tasas solo existen con denominador > 0 y sin superar el 100 %', () => {
    expect(ratio(87, 1284)).toBe(6.8);
    expect(ratio(18, 87)).toBe(20.7);
    expect(ratio(5, 5)).toBe(100);
    expect(ratio(3, 0)).toBeNull();
    expect(ratio(13, 1)).toBeNull(); // más solicitudes que visitas: la tasa no aplica
  });
});
