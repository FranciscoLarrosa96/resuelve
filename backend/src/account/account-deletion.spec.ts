import { DeletionBlocker, deletedEmail, deletedSlug, deletionBlockers } from './account-deletion';

describe('account-deletion', () => {
  it('sin trabajos ni suscripción no hay nada que lo impida', () => {
    expect(deletionBlockers({ activeJobs: 0, openSubscriptions: 0 })).toEqual([]);
  });

  it('un trabajo en curso y una suscripción viva bloquean, con mensaje accionable', () => {
    const blocks = deletionBlockers({ activeJobs: 2, openSubscriptions: 1 });
    expect(blocks.map((b) => b.code)).toEqual([DeletionBlocker.ACTIVE_JOBS, DeletionBlocker.OPEN_SUBSCRIPTION]);
    expect(blocks[0]).toMatchObject({ count: 2, message: expect.stringContaining('2 trabajos en curso') });
    expect(blocks[1].message).toContain('Mi plan');
  });

  it('singular cuando es uno', () => {
    expect(deletionBlockers({ activeJobs: 1, openSubscriptions: 0 })[0].message).toContain('1 trabajo en curso');
  });

  it('email y slug anonimizados no repiten nombre y no se pueden usar para ingresar', () => {
    const id = '0f5e8e0a-1111-4222-8333-444455556666';
    expect(deletedEmail(id)).toBe(`eliminado-${id}@eliminado.invalid`);
    expect(deletedSlug(id)).toBe('profesional-eliminado-0f5e8e0a');
  });
});
