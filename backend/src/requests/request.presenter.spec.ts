import type { ServiceRequest } from './service-request.entity';
import { InvitationStatus, RequestStatus, RequestUrgency } from './request.enums';
import { presentRequestForClient, presentRequestForProfessional } from './request.presenter';

const PRO_A = 'pro-a';
const PRO_B = 'pro-b';

function request(status: RequestStatus, selected: string | null = null): ServiceRequest {
  return {
    id: 'r1',
    title: 'Pérdida bajo mesada',
    description: 'Gotea la pileta',
    urgency: RequestUrgency.TODAY,
    status,
    serviceId: 's1',
    zoneId: 'z1',
    zone: { id: 'z1', name: 'Villa Italia', slug: 'villa-italia' },
    exactAddress: 'Alem 455',
    formattedAddress: 'Alem 455, Tandil, Buenos Aires, Argentina',
    latitude: -37.3211,
    longitude: -59.1401,
    providerPlaceId: 'private-place-id',
    propertyType: 'APARTMENT',
    floor: '3',
    unit: 'B',
    selectedProfessionalId: selected,
    acceptedQuoteId: selected ? 'accepted-quote' : null,
    client: { firstName: 'María', lastName: 'González', phone: '+54 249 400 1234' },
    invitations: [
      { professionalId: PRO_A, status: InvitationStatus.PENDING },
      { professionalId: PRO_B, status: InvitationStatus.PENDING },
    ],
    photos: [],
  } as unknown as ServiceRequest;
}

describe('privacidad de la solicitud', () => {
  it('un profesional invitado ve la zona pero no la dirección ni el teléfono', () => {
    const json = JSON.stringify(presentRequestForProfessional(request(RequestStatus.QUOTES_RECEIVED), PRO_A));
    expect(json).toContain('Villa Italia');
    expect(json).not.toContain('Alem 455');
    expect(json).not.toContain('400 1234');
    expect(json).not.toContain('González');
    expect(json).not.toContain('private-place-id');
    expect(json).not.toContain('-37.3211');
    expect(json).not.toContain('Unidad B');
  });

  it('una oportunidad bloqueada se redacta en backend y conserva solo servicio, barrio y antigüedad', () => {
    const out = presentRequestForProfessional(request(RequestStatus.WAITING_QUOTES), PRO_A, null, {
      blocked: true,
      targeted: false,
    });
    expect(out.opportunity).toMatchObject({ blocked: true, targeted: false, actionable: false, delayed: false });
    expect(out.description).toBe('');
    expect(out.photos).toEqual([]);
    expect(out.client).toBeNull();
    expect(out.desiredDate).toBeNull();
    const json = JSON.stringify(out);
    expect(json).toContain('Villa Italia');
    expect(json).not.toContain('Gotea la pileta');
    expect(json).not.toContain('María');
    expect(json).not.toContain('Alem 455');
  });

  it('el profesional NO seleccionado sigue sin ver la dirección después de la elección', () => {
    const out = presentRequestForProfessional(request(RequestStatus.PROFESSIONAL_SELECTED, PRO_A), PRO_B);
    expect(out.contact).toBeNull();
    expect(JSON.stringify(out)).not.toContain('Alem 455');
  });

  it('el profesional seleccionado ve dirección y teléfono mientras el trabajo está activo', () => {
    for (const status of [
      RequestStatus.PROFESSIONAL_SELECTED,
      RequestStatus.SCHEDULED,
      RequestStatus.AWAITING_REVIEW,
    ]) {
      const out = presentRequestForProfessional(request(status, PRO_A), PRO_A);
      expect(out.contact).toEqual({
        fullName: 'María González',
        phone: '+54 249 400 1234',
        exactAddress: 'Alem 455',
        location: {
          formattedAddress: 'Alem 455, Tandil, Buenos Aires, Argentina',
          latitude: -37.3211,
          longitude: -59.1401,
          providerPlaceId: 'private-place-id',
          propertyType: 'APARTMENT',
          floor: '3',
          unit: 'B',
        },
      });
    }
  });

  it('una vez cerrado o cancelado, deja de compartirse el contacto', () => {
    expect(presentRequestForProfessional(request(RequestStatus.CLOSED, PRO_A), PRO_A).contact).toBeNull();
    expect(presentRequestForProfessional(request(RequestStatus.CANCELLED, PRO_A), PRO_A).contact).toBeNull();
  });

  it('el cliente dueño siempre ve su dirección', () => {
    const out = presentRequestForClient(request(RequestStatus.WAITING_QUOTES));
    expect(out.exactAddress).toBe('Alem 455');
    expect(out.location).toMatchObject({ latitude: -37.3211, longitude: -59.1401, propertyType: 'APARTMENT' });
  });

  it('selección sin quote aceptado no habilita datos exactos', () => {
    const pending = { ...request(RequestStatus.PROFESSIONAL_SELECTED, PRO_A), acceptedQuoteId: null } as ServiceRequest;
    const json = JSON.stringify(presentRequestForProfessional(pending, PRO_A));
    expect(json).not.toContain('Alem 455');
    expect(json).not.toContain('-37.3211');
    expect(json).not.toContain('private-place-id');
  });

  it('solicitud legacy sin geodata continúa renderizando', () => {
    const legacy = { ...request(RequestStatus.WAITING_QUOTES), formattedAddress: null, latitude: null, longitude: null, providerPlaceId: null, propertyType: null, floor: null, unit: null } as ServiceRequest;
    expect(presentRequestForClient(legacy).location).toBeNull();
    expect(presentRequestForProfessional(legacy, PRO_A).contact).toBeNull();
  });
});
