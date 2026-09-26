import { layoutLanes } from './agenda-layout';

const b = (id: string, start: string, end: string) => {
  const min = (t: string) => Number(t.split(':')[0]) * 60 + Number(t.split(':')[1]);
  return { id, startMin: min(start), endMin: min(end) };
};

describe('layoutLanes (agenda sin bloques encimados)', () => {
  it('trabajos que no se tocan ocupan todo el ancho', () => {
    const out = layoutLanes([b('a', '9:00', '10:00'), b('b', '10:00', '11:00'), b('c', '14:00', '15:30')]);
    expect([...out.values()]).toEqual([
      { lane: 0, lanes: 1 },
      { lane: 0, lanes: 1 },
      { lane: 0, lanes: 1 },
    ]);
  });

  it('dos simultáneos se reparten el ancho en dos carriles', () => {
    const out = layoutLanes([b('a', '10:00', '12:00'), b('b', '10:30', '11:00')]);
    expect(out.get('a')).toEqual({ lane: 0, lanes: 2 });
    expect(out.get('b')).toEqual({ lane: 1, lanes: 2 });
  });

  it('un grupo transitivo usa el mismo ancho para todos y reutiliza carriles libres', () => {
    // a pisa a b, b pisa a c, pero a y c no se tocan: c vuelve al carril de a.
    const out = layoutLanes([b('a', '9:00', '10:00'), b('b', '9:30', '11:00'), b('c', '10:00', '12:00')]);
    expect(out.get('a')).toEqual({ lane: 0, lanes: 2 });
    expect(out.get('b')).toEqual({ lane: 1, lanes: 2 });
    expect(out.get('c')).toEqual({ lane: 0, lanes: 2 });
  });

  it('tres a la misma hora: tres carriles', () => {
    const out = layoutLanes([b('a', '15:00', '16:00'), b('b', '15:00', '16:00'), b('c', '15:00', '15:30')]);
    expect(new Set([...out.values()].map((s) => s.lane))).toEqual(new Set([0, 1, 2]));
    expect([...out.values()].every((s) => s.lanes === 3)).toBe(true);
  });

  it('con altura mínima visible, dos trabajos cortos seguidos no se pisan', () => {
    const shorts = [b('a', '9:00', '9:15'), b('b', '9:15', '9:30')];
    expect(layoutLanes(shorts).get('b')).toEqual({ lane: 0, lanes: 1 });
    const out = layoutLanes(shorts, 36);
    expect(out.get('a')).toEqual({ lane: 0, lanes: 2 });
    expect(out.get('b')).toEqual({ lane: 1, lanes: 2 });
  });

  it('el orden de entrada no cambia el resultado', () => {
    const list = [b('c', '10:00', '12:00'), b('a', '9:00', '10:00'), b('b', '9:30', '11:00')];
    expect(layoutLanes(list)).toEqual(layoutLanes([...list].reverse()));
  });
});
