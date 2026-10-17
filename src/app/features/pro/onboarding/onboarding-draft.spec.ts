import { describe, expect, it } from 'vitest';
import {
  DRAFT_TTL_MS,
  OnboardingDraftStore,
  OnboardingDraft,
  draftKey,
  hasContent,
  parseDraft,
  parseLegacyDraft,
} from './onboarding-draft';
import { applyHeadlineSuggestion } from './headline-suggestion';

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length() { return this.data.size; }
  clear() { this.data.clear(); }
  getItem(k: string) { return this.data.get(k) ?? null; }
  key(i: number) { return [...this.data.keys()][i] ?? null; }
  removeItem(k: string) { this.data.delete(k); }
  setItem(k: string, v: string) { this.data.set(k, v); }
}

const base = (userId: string): Omit<OnboardingDraft, 'v' | 'rev' | 'savedAt'> => ({
  userId, step: 2, serviceIds: ['s1'], specialties: [], coverage: [], primaryLocalityId: null,
  headline: '', headlineEdited: false, headlineAuto: null, bio: '', yearsExperience: null, availableToday: false,
});

function setup(now = { t: 1_000_000 }) {
  const local = new MemoryStorage();
  const session = new MemoryStorage();
  const mk = () => new OnboardingDraftStore(() => local, () => session, () => now.t);
  return { local, session, mk, now };
}

describe('OnboardingDraftStore', () => {
  it('guarda y recupera por cuenta; otra cuenta no lo ve', () => {
    const { mk } = setup();
    const a = mk();
    expect(a.save(base('u1'))).toBe('saved');
    expect(mk().load('u1')?.serviceIds).toEqual(['s1']);
    expect(mk().load('u2')).toBeNull();
  });

  it('un borrador con el id de otra cuenta guardado bajo la clave propia se descarta', () => {
    const { local, mk } = setup();
    mk().save(base('u1'));
    local.setItem(draftKey('u2'), local.getItem(draftKey('u1'))!);
    expect(mk().load('u2')).toBeNull();
  });

  it('vence a las 24 h de inactividad y cada guardado renueva el plazo', () => {
    const { mk, now } = setup();
    const s = mk();
    s.save(base('u1'));
    now.t += DRAFT_TTL_MS - 1000;
    expect(s.save(base('u1'))).toBe('saved'); // actividad: renueva
    now.t += DRAFT_TTL_MS - 1000;
    expect(mk().load('u1')).not.toBeNull();
    now.t += 2000;
    expect(mk().load('u1')).toBeNull();
  });

  it('una pestaña vieja no pisa lo que otra guardó después, salvo que la persona lo decida', () => {
    const { mk } = setup();
    const tabA = mk();
    tabA.save(base('u1'));
    const tabB = mk();
    tabB.load('u1');
    tabA.save({ ...base('u1'), headline: 'Plomero', headlineEdited: true });
    expect(tabB.hasNewerElsewhere('u1')).toBe(true);
    expect(tabB.save({ ...base('u1'), headline: 'Otro' })).toBe('conflict');
    expect(mk().load('u1')?.headline).toBe('Plomero');
    expect(tabB.save({ ...base('u1'), headline: 'Otro' }, true)).toBe('saved');
    expect(mk().load('u1')?.headline).toBe('Otro');
  });

  it('abrir otra pestaña sin cambiar nada no genera conflicto en la primera', () => {
    const { mk } = setup();
    const tabA = mk();
    tabA.save(base('u1'));
    const tabB = mk();
    tabB.load('u1');
    expect(tabB.save(base('u1'))).toBe('saved'); // mismo contenido: no sube la revisión
    expect(tabA.hasNewerElsewhere('u1')).toBe(false);
    expect(tabA.save({ ...base('u1'), bio: 'cambio real' })).toBe('saved');
  });

  it('un cambio dentro de la cobertura sí cuenta como cambio de contenido', () => {
    const { mk } = setup();
    const loc = { id: 'l1', name: 'Tandil', slug: 'tandil', provinceName: 'Buenos Aires' } as never;
    const a = mk();
    a.save({ ...base('u1'), coverage: [{ locality: loc, coversEntireCity: true, zoneIds: [] }] });
    const b = mk();
    b.load('u1');
    expect(b.save({ ...base('u1'), coverage: [{ locality: loc, coversEntireCity: false, zoneIds: ['z1'] }] })).toBe('saved');
    expect(a.hasNewerElsewhere('u1')).toBe(true);
  });

  it('sin cambios de contenido igual renueva el plazo de 24 h pasado un rato', () => {
    const { mk, now } = setup();
    const s = mk();
    s.save(base('u1'));
    now.t += 10 * 60 * 1000;
    s.save(base('u1'));
    now.t += DRAFT_TTL_MS - 5 * 60 * 1000;
    expect(mk().load('u1')).not.toBeNull();
  });

  it('adoptar lo más reciente permite seguir guardando', () => {
    const { mk } = setup();
    const tabA = mk();
    tabA.save(base('u1'));
    const tabB = mk();
    tabB.load('u1');
    tabA.save({ ...base('u1'), bio: 'nuevo' });
    const newer = tabB.peek('u1')!;
    tabB.adopt(newer);
    expect(tabB.save({ ...base('u1'), bio: 'nuevo 2' })).toBe('saved');
  });

  it('clear borra el borrador actual y el de la versión anterior', () => {
    const { local, session, mk } = setup();
    const s = mk();
    s.save(base('u1'));
    session.setItem('resuelve:onboarding-pro:u1', '{}');
    s.clear('u1');
    expect(local.getItem(draftKey('u1'))).toBeNull();
    expect(session.getItem('resuelve:onboarding-pro:u1')).toBeNull();
  });

  it('sin almacenamiento disponible no rompe', () => {
    const s = new OnboardingDraftStore(() => null, () => null);
    expect(s.save(base('u1'))).toBe('unavailable');
    expect(s.load('u1')).toBeNull();
    const throwing = new OnboardingDraftStore(() => { throw new Error('bloqueado'); }, () => null);
    expect(() => throwing.load('u1')).not.toThrow();
    expect(throwing.save(base('u1'))).toBe('unavailable');
  });

  it('no guarda nada que no sea del alta (sin contraseña ni tokens)', () => {
    const { local, mk } = setup();
    mk().save({ ...base('u1'), headline: 'x' });
    const raw = local.getItem(draftKey('u1'))!;
    expect(Object.keys(JSON.parse(raw)).sort()).toEqual(
      ['availableToday', 'bio', 'coverage', 'headline', 'headlineAuto', 'headlineEdited', 'primaryLocalityId', 'rev', 'savedAt', 'serviceIds', 'specialties', 'step', 'userId', 'v', 'yearsExperience'],
    );
  });

  it('datos ilegibles o inválidos se ignoran', () => {
    expect(parseDraft('{no es json', 'u1', 1)).toBeNull();
    expect(parseDraft(JSON.stringify({ v: 1 }), 'u1', 1)).toBeNull();
  });
});

describe('borrador de la versión anterior', () => {
  const legacy = (o: object) => JSON.stringify({ savedAt: 1000, step: 5, serviceIds: ['s1'], headline: 'Plomero', bio: '', yearsExperience: 0, availableToday: true, ...o });

  it('se conserva y se adapta a 4 pasos (5→4, 4→3)', () => {
    expect(parseLegacyDraft(legacy({}), 'u1', 2000)?.step).toBe(4);
    expect(parseLegacyDraft(legacy({ step: 4 }), 'u1', 2000)?.step).toBe(3);
    expect(parseLegacyDraft(legacy({ step: 2 }), 'u1', 2000)?.step).toBe(2);
  });

  it('el título escrito queda como de la persona y el 0 inicial pasa a no informado', () => {
    const d = parseLegacyDraft(legacy({}), 'u1', 2000)!;
    expect(d.headlineEdited).toBe(true);
    expect(d.yearsExperience).toBeNull();
    expect(d.availableToday).toBe(true);
    expect(parseLegacyDraft(legacy({ yearsExperience: 8 }), 'u1', 2000)!.yearsExperience).toBe(8);
  });

  it('load lo lee de sessionStorage cuando no hay uno nuevo', () => {
    const { session, mk } = setup({ t: 2000 });
    session.setItem('resuelve:onboarding-pro:u1', legacy({}));
    expect(mk().load('u1')?.serviceIds).toEqual(['s1']);
  });

  it('vencido no se recupera', () => {
    expect(parseLegacyDraft(legacy({}), 'u1', 1000 + DRAFT_TTL_MS + 1)).toBeNull();
  });
});

describe('hasContent', () => {
  it('un borrador vacío en el paso 1 no cuenta', () => {
    const { mk } = setup();
    const s = mk();
    s.save({ ...base('u1'), step: 1, serviceIds: [] });
    expect(hasContent(s.load('u1')!)).toBe(false);
  });
});

describe('título sugerido', () => {
  const s = (headline: string, edited = false, auto: string | null = null) => ({ headline, edited, auto });

  it('completa un título vacío con el primer oficio', () => {
    expect(applyHeadlineSuggestion(s(''), 'Plomería')).toEqual({ headline: 'Plomería', edited: false, auto: 'Plomería' });
  });

  it('acompaña el cambio de oficio mientras sea el título sugerido', () => {
    expect(applyHeadlineSuggestion(s('Plomería', false, 'Plomería'), 'Gas').headline).toBe('Gas');
    expect(applyHeadlineSuggestion(s('Plomería', false, 'Plomería'), null).headline).toBe('');
  });

  it('nunca pisa un título escrito, ni uno que se vació a propósito', () => {
    expect(applyHeadlineSuggestion(s('Plomero matriculado'), 'Gas').headline).toBe('Plomero matriculado');
    expect(applyHeadlineSuggestion(s('Plomero', true, 'Plomería'), 'Gas').headline).toBe('Plomero');
    expect(applyHeadlineSuggestion(s('', true, 'Plomería'), 'Gas').headline).toBe('');
  });

  it('sin oficio aprobado no hay sugerencia', () => {
    expect(applyHeadlineSuggestion(s(''), null)).toEqual({ headline: '', edited: false, auto: null });
  });
});
