import { CONTACT_SHARED_STATUSES } from './request-state-machine';
import type { ServiceRequest } from './service-request.entity';

/**
 * Serialización de solicitudes según QUIÉN mira. Es el único lugar que
 * decide qué datos privados salen de la API; el frontend no filtra nada.
 *
 * - Cliente dueño: todo (incluida la dirección exacta).
 * - Profesional invitado: barrio/zona, descripción y fotos. Del cliente,
 *   solo nombre e inicial del apellido.
 * - Profesional ELEGIDO, mientras el trabajo está activo
 *   (PROFESSIONAL_SELECTED, SCHEDULED, AWAITING_REVIEW): además dirección
 *   exacta, nombre completo y teléfono del cliente.
 */

function baseFields(r: ServiceRequest) {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    urgency: r.urgency,
    status: r.status,
    desiredDate: r.desiredDate,
    desiredTimeRange: r.desiredTimeRange,
    service: r.service
      ? { id: r.service.id, name: r.service.name, slug: r.service.slug }
      : { id: r.serviceId },
    zone: r.zone ? { id: r.zone.id, name: r.zone.name, slug: r.zone.slug } : { id: r.zoneId },
    photos: [...(r.photos ?? [])]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((p) => ({ id: p.id, url: p.url })),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export function presentRequestForClient(r: ServiceRequest) {
  return {
    ...baseFields(r),
    exactAddress: r.exactAddress,
    selectedProfessionalId: r.selectedProfessionalId,
    acceptedQuoteId: r.acceptedQuoteId,
    completedAt: r.completedAt,
    cancelledAt: r.cancelledAt,
    invitations: (r.invitations ?? []).map((inv) => ({
      id: inv.id,
      professionalId: inv.professionalId,
      status: inv.status,
      sentAt: inv.sentAt,
      respondedAt: inv.respondedAt,
      professional: inv.professional?.user
        ? {
            id: inv.professional.id,
            displayName: `${inv.professional.user.firstName} ${inv.professional.user.lastName}`,
            avatarUrl: inv.professional.user.avatarUrl,
            averageRating: inv.professional.averageRating,
            reviewsCount: inv.professional.reviewsCount,
          }
        : undefined,
    })),
  };
}

export function canSeeClientContact(
  r: Pick<ServiceRequest, 'selectedProfessionalId' | 'status'>,
  professionalId: string,
): boolean {
  return r.selectedProfessionalId === professionalId && CONTACT_SHARED_STATUSES.includes(r.status);
}

export function presentRequestForProfessional(r: ServiceRequest, professionalId: string) {
  const mine = (r.invitations ?? []).find((inv) => inv.professionalId === professionalId);
  const contactShared = canSeeClientContact(r, professionalId);
  const client = r.client;
  return {
    ...baseFields(r),
    invitationStatus: mine?.status ?? null,
    /** "También lo recibieron N profesionales" */
    otherInvitedCount: Math.max(0, (r.invitations ?? []).length - 1),
    selectedByClient: r.selectedProfessionalId === professionalId,
    client: client ? { firstName: client.firstName, lastInitial: client.lastName.charAt(0) } : null,
    // La clave existe siempre para que el contrato sea estable; su contenido es null hasta que corresponde.
    contact: contactShared
      ? {
          fullName: `${client.firstName} ${client.lastName}`,
          phone: client.phone,
          exactAddress: r.exactAddress,
        }
      : null,
  };
}
