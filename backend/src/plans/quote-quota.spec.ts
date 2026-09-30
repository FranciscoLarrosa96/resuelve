import type { ConfigService } from '@nestjs/config';
import type { EntityManager } from 'typeorm';
import { validateEnv } from '../config/env.validation';
import { freeQuoteLimit, freeQuoteUsage, presentQuoteUsage } from './quote-quota';

describe('cupo Free total', () => {
  const config = (values: Record<string, number>) => ({
    get: (key: string, fallback?: number) => values[key] ?? fallback,
  }) as ConfigService;

  it('usa FREE_QUOTE_LIMIT y conserva el fallback de configuración', () => {
    expect(freeQuoteLimit(config({ FREE_QUOTE_LIMIT: 5, FREE_MONTHLY_QUOTE_LIMIT: 2 }))).toBe(5);
    expect(freeQuoteLimit(config({ FREE_QUOTE_LIMIT: 2 }))).toBe(2);
    expect(freeQuoteLimit(config({ FREE_QUOTE_LIMIT: 0 }))).toBeNull();
  });

  it('migra FREE_MONTHLY_QUOTE_LIMIT a la config total cuando falta el nombre nuevo', () => {
    const env = validateEnv({
      DATABASE_URL: 'postgresql://resuelve:local@localhost:5433/resuelve_test',
      JWT_ACCESS_SECRET: 'a'.repeat(32),
      JWT_REFRESH_SECRET: 'b'.repeat(32),
      FREE_MONTHLY_QUOTE_LIMIT: '3',
    });
    expect(env.FREE_QUOTE_LIMIT).toBe(3);
    expect(env.FREE_MONTHLY_QUOTE_LIMIT).toBe(3);
  });

  it('cuenta solo consumos Free sin filtrar por mes', async () => {
    const manager = { query: jest.fn().mockResolvedValue([{ used: 5 }]) };
    await expect(freeQuoteUsage(manager as unknown as EntityManager, 'pro-1')).resolves.toBe(5);
    const [sql, values] = manager.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('consumes_free_quota = true');
    expect(sql).not.toMatch(/consumed_at\s*(?:>=|<)/i);
    expect(values).toEqual(['pro-1']);
  });

  it('presenta agotamiento sin periodo mensual y limita el remanente a cero', () => {
    expect(presentQuoteUsage(7, 5)).toEqual({ used: 7, limit: 5, remaining: 0 });
    expect(presentQuoteUsage(3, null)).toEqual({ used: 3, limit: null, remaining: null });
  });
});
