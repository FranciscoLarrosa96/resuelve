import { describe, expect, it } from 'vitest';
import { headlineRepeatsChips, serviceChipsView } from './service-chips';

const svc = (slug: string, name = slug) => ({ id: `id-${slug}`, name, slug });
const five = ['electricidad', 'redes', 'reparacion-de-pc', 'gas', 'pintura'].map((s) => svc(s));

describe('serviceChipsView', () => {
  it('un servicio → un chip, sin extra', () => {
    const v = serviceChipsView([svc('gas')]);
    expect(v.visible).toHaveLength(1);
    expect(v.hidden).toHaveLength(0);
  });
  it('dos servicios → dos chips', () => {
    expect(serviceChipsView(five.slice(0, 2)).visible).toHaveLength(2);
  });
  it('cinco servicios → dos chips y +3', () => {
    const v = serviceChipsView(five);
    expect(v.visible).toHaveLength(2);
    expect(v.hidden).toHaveLength(3);
  });
  it('el servicio buscado va primero y el resto conserva su orden', () => {
    const v = serviceChipsView(five, 'id-reparacion-de-pc');
    expect(v.visible.map((s) => s.slug)).toEqual(['reparacion-de-pc', 'electricidad']);
    expect(v.hidden.map((s) => s.slug)).toEqual(['redes', 'gas', 'pintura']);
  });
  it('sin filtro o filtro que no ofrece → orden del modelo, sin inventar', () => {
    expect(serviceChipsView(five).visible[0].slug).toBe('electricidad');
    expect(serviceChipsView(five, 'id-otro').visible[0].slug).toBe('electricidad');
  });
  it('sin servicios no falla; sin duplicados', () => {
    expect(serviceChipsView([]).visible).toEqual([]);
    expect(serviceChipsView(undefined).hidden).toEqual([]);
    expect(serviceChipsView([svc('gas'), svc('gas')]).visible).toHaveLength(1);
  });
  it('el título que repite un chip no se vuelve a mostrar', () => {
    const v = serviceChipsView([svc('electricidad', 'Electricidad')]);
    expect(headlineRepeatsChips('electricidad', v)).toBe(true);
    expect(headlineRepeatsChips('Electricista matriculado', v)).toBe(false);
    expect(headlineRepeatsChips('', v)).toBe(false);
  });
});
