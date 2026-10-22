import { localActivityReport, LOCAL_ACTIVITY_NOTES } from './local-activity-report';

describe('actividad local agregada', () => {
  it('período exclusivo y consulta sin escrituras, conserva SIN_LOCALIDAD', async () => {
    const rows = [{ localityId: null, label: 'SIN_LOCALIDAD', profileViews: 3 }];
    const waiting = [{ locality: 'Tandil, Buenos Aires', service: 'Plomería', people: 2 }];
    const query = jest.fn().mockResolvedValueOnce(rows).mockResolvedValueOnce(waiting);
    const from = new Date('2026-01-01Z'),
      to = new Date('2026-02-01Z');
    const report = await localActivityReport({ query }, from, to);
    expect(report.rows).toEqual(rows);
    expect(report.waiting).toEqual(waiting);
    expect(query.mock.calls[0][1]).toEqual([from, to]);
    for (const [sql] of query.mock.calls) expect(sql).not.toMatch(/\b(INSERT|UPDATE|DELETE|ALTER)\b/);
    expect(LOCAL_ACTIVITY_NOTES.join(' ')).toContain('no búsquedas');
  });
  it('rechaza períodos inválidos sin consultar', async () => {
    const query = jest.fn();
    await expect(localActivityReport({ query }, new Date('invalid'), new Date())).rejects.toThrow('Período');
    expect(query).not.toHaveBeenCalled();
  });
});
