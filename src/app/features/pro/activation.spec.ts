import { OwnProfessional } from '../../core/models/pro-profile';
import { activationTips } from './activation';

const contact = (c: { whatsappEnabled?: boolean; callsEnabled?: boolean; requestsEnabled?: boolean }) => ({
  whatsappEnabled: false, callsEnabled: false, requestsEnabled: false, whatsappNumber: null, whatsappDisplay: null, phoneNumber: null, phoneDisplay: null, phoneKind: null, consentAt: null, ...c,
});

const own = (extra: Partial<OwnProfessional> = {}) =>
  ({
    id: 'p1', status: 'ACTIVE', avatarUrl: 'https://res.cloudinary.test/a.jpg', reviewsCount: 1, invitedReviewsCount: 0, firstSuccessAt: null,
    offeredServices: [{ id: 's', name: 'Gas', slug: 'gas', public: true }],
    coverage: [{ locality: { id: 'mdp', name: 'Mar del Plata' }, coversEntireCity: true, zones: [] }],
    coversEntireCity: true, zones: [],
    contact: contact({ requestsEnabled: true }),
    ...extra,
  }) as unknown as OwnProfessional;

describe('activationTips: compartir', () => {
  it('publicado, con foto, trabajos y solo solicitudes por Resuelve: sugiere contacto directo y, al final, compartir', () => {
    expect(activationTips(own(), 2)).toEqual(['CONTACT', 'SHARE']);
  });

  it('dejar el contacto directo para después no impide llegar a compartir', () => {
    expect(activationTips(own(), 2, ['CONTACT'])).toEqual(['SHARE']);
  });

  it('con WhatsApp o llamadas también', () => {
    expect(activationTips(own({ contact: contact({ whatsappEnabled: true }) }), 2)).toEqual(['SHARE']);
    expect(activationTips(own({ contact: contact({ callsEnabled: true }) }), 2)).toEqual(['SHARE']);
  });

  it('compartir sigue al final: antes, la primera reseña', () => {
    expect(activationTips(own({ reviewsCount: 0 }), 2, ['CONTACT'])).toEqual(['REVIEW', 'SHARE']);
  });

  it('sin foto o sin trabajos no se sugiere compartir', () => {
    expect(activationTips(own({ avatarUrl: null }), 2)).not.toContain('SHARE');
    expect(activationTips(own(), 0)).toContain('SHARE');
    const paid = own();
    paid.plan = { tier: 'PRO', expiresAt: null, entitlements: { portfolioWorkLimit: 10 } } as OwnProfessional['plan'];
    expect(activationTips(paid, 0)).not.toContain('SHARE');
  });

  it('nunca con el perfil sin publicar', () => {
    expect(activationTips(own({ offeredServices: [] }), 2)).toEqual([]);
    expect(activationTips(own({ coverage: [], coversEntireCity: false }), 2)).toEqual([]);
  });

  it('sin el dato de contacto (backend anterior) rige solo solicitudes', () => {
    expect(activationTips(own({ contact: undefined }), 2, ['CONTACT'])).toEqual(['SHARE']);
  });
});
