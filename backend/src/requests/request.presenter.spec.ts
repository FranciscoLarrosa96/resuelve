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
    selectedProfessionalId: selected,
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
      });
    }
  });

  it('una vez cerrado o cancelado, deja de compartirse el contacto', () => {
    expect(presentRequestForProfessional(request(RequestStatus.CLOSED, PRO_A), PRO_A).contact).toBeNull();
    expect(presentRequestForProfessional(request(RequestStatus.CANCELLED, PRO_A), PRO_A).contact).toBeNull();
  });

  it('el cliente dueño siempre ve su dirección', () => {
    expect(presentRequestForClient(request(RequestStatus.WAITING_QUOTES)).exactAddress).toBe('Alem 455');
  });
});
