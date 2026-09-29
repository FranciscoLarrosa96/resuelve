import type { Appointment } from '../appointments/appointment.entity';
import { presentAppointment } from '../appointments/appointment.presenter';
import { isCompletionDue } from '../appointments/completion';
import { publicRating } from '../professionals/professional.presenter';
import { reviewBlocker } from '../reviews/review-eligibility';
import type { Review } from '../reviews/review.entity';
import { presentOwnReview } from '../reviews/review.presenter';
import { CONTACT_SHARED_STATUSES } from './request-state-machine';
import type { ServiceRequest } from './service-request.entity';

export interface RequestQuoteCapacity {
  activeQuoteCount: number;
  maxActiveQuotes: number;
  remainingQuoteSlots: number;
  slotsFull: boolean;
}

/**
 * Serialización de solicitudes según QUIÉN mira. Es el único lugar que
 * decide qué datos privados salen de la API; el frontend no filtra nada.
 *
 * - Cliente dueño: todo (incluida la dirección exacta).
 * - Profesional invitado: barrio/zona, descripción y fotos. Del cliente,
 *   solo nombre e inicial del apellido.
 * - Profesional ELEGIDO luego de aceptar su presupuesto, mientras el trabajo
 *   está activo (PROFESSIONAL_SELECTED, SCHEDULED, AWAITING_REVIEW): además
 *   dirección/coordenadas exactas, datos de acceso, nombre y teléfono.
 * - La cita (`appointment`, la más reciente) la ven solo el cliente dueño y
 *   el profesional elegido. Los demás invitados reciben `null`.
 * - `completionDue` (horario confirmado terminado, trabajo sin cerrar) se
 *   deriva al consultar; nunca completa nada por sí solo. `canComplete` es la
 *   misma regla que valida POST /requests/:id/complete (única fuente: la UI
 *   no recalcula con su reloj, relee al llegar `endsAt`).
 */

function baseFields(r: ServiceRequest, blocked = false) {
  return {
    id: r.id,
    title: blocked ? `${r.service?.name ?? 'Servicio'} · ${r.zone?.name ?? 'Zona'}` : r.title,
    description: blocked ? '' : r.description,
    urgency: r.urgency,
    status: r.status,
    desiredDate: blocked ? null : r.desiredDate,
    desiredTimeRange: blocked ? null : r.desiredTimeRange,
    service: r.service
      ? { id: r.service.id, name: r.service.name, slug: r.service.slug }
      : { id: r.serviceId },
    zone: r.zone ? { id: r.zone.id, name: r.zone.name, slug: r.zone.slug } : { id: r.zoneId },
    photos: (blocked ? [] : [...(r.photos ?? [])])
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((p) => ({ id: p.id, url: p.url })),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export function presentRequestForClient(
  r: ServiceRequest,
  appointment: Appointment | null = null,
  review: Review | null = null,
  quoteCapacity?: RequestQuoteCapacity,
) {
  const selected = (r.invitations ?? []).find((inv) => inv.professionalId === r.selectedProfessionalId);
  const due = isCompletionDue(r.status, appointment);
  return {
    ...baseFields(r),
    appointment: appointment ? presentAppointment(appointment) : null,
    /** Horario confirmado ya terminado y trabajo sin cerrar: "¿Se realizó el trabajo?". */
    completionDue: due,
    /** Misma regla que POST /requests/:id/complete (el dueño puede cerrar): la UI solo muestra el CTA si es true. */
    canComplete: due,
    /** La reseña que dejó este cliente (una por trabajo). */
    review: review ? presentOwnReview(review) : null,
    /** Misma regla que POST /requests/:id/review: la UI solo muestra el CTA si es true. */
    canReview: reviewBlocker(r, r.clientId, !!review, selected?.professional?.userId ?? null) === null,
    exactAddress: r.exactAddress,
    location: privateLocation(r),
    selectedProfessionalId: r.selectedProfessionalId,
    acceptedQuoteId: r.acceptedQuoteId,
    completedAt: r.completedAt,
    /** Quién confirmó que se realizó (solo lo ven las partes). */
    completedBy: r.completedBy,
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
            avatarUrl: inv.professional.avatarUrl ?? inv.professional.user.avatarUrl,
            averageRating: publicRating(inv.professional),
            reviewsCount: inv.professional.reviewsCount,
          }
        : undefined,
    })),
    ...(quoteCapacity ? { quoteCapacity } : {}),
  };
}

export function canSeeClientContact(
  r: Pick<ServiceRequest, 'selectedProfessionalId' | 'acceptedQuoteId' | 'status'>,
  professionalId: string,
): boolean {
  return !!r.acceptedQuoteId && r.selectedProfessionalId === professionalId && CONTACT_SHARED_STATUSES.includes(r.status);
}

function privateLocation(r: ServiceRequest) {
  if (r.latitude === null || r.latitude === undefined || r.longitude === null || r.longitude === undefined) return null;
  return {
    formattedAddress: r.formattedAddress,
    latitude: r.latitude,
    longitude: r.longitude,
    providerPlaceId: r.providerPlaceId,
    propertyType: r.propertyType,
    floor: r.floor,
    unit: r.unit,
  };
}

export function presentRequestForProfessional(
  r: ServiceRequest,
  professionalId: string,
  appointment: Appointment | null = null,
  access: {
    blocked?: boolean;
    delayed?: boolean;
    targeted?: boolean;
    availableAt?: Date | null;
    actionable?: boolean;
    activeQuoteCount?: number;
    maxActiveQuotes?: number;
    attributionSource?: string;
  } = {},
) {
  const mine = (r.invitations ?? []).find((inv) => inv.professionalId === professionalId);
  const contactShared = canSeeClientContact(r, professionalId);
  const selected = r.selectedProfessionalId === professionalId;
  const proCompletionDue =
    selected && appointment?.professionalId === professionalId && isCompletionDue(r.status, appointment);
  const client = r.client;
  return {
    ...baseFields(r, !!access.blocked || !!access.delayed),
    opportunity: {
      blocked: !!access.blocked,
      delayed: !!access.delayed,
      targeted: !!access.targeted,
      availableToProfessionalAt: access.availableAt?.toISOString() ?? null,
      actionable: !!access.actionable,
      activeQuoteCount: access.activeQuoteCount ?? 0,
      maxActiveQuotes: access.maxActiveQuotes ?? 5,
      remainingQuoteSlots: Math.max(0, (access.maxActiveQuotes ?? 5) - (access.activeQuoteCount ?? 0)),
      slotsFull: (access.activeQuoteCount ?? 0) >= (access.maxActiveQuotes ?? 5),
      attributionSource: access.attributionSource ?? 'OTHER',
    },
    invitationStatus: mine?.status ?? null,
    /** "También lo recibieron N profesionales" */
    otherInvitedCount: Math.max(0, (r.invitations ?? []).length - 1),
    selectedByClient: selected,
    completedAt: selected ? r.completedAt : null,
    completedBy: selected ? r.completedBy : null,
    appointment:
      selected && appointment?.professionalId === professionalId ? presentAppointment(appointment) : null,
    completionDue: proCompletionDue,
    /** Misma regla que POST /requests/:id/complete para el elegido. */
    canComplete: proCompletionDue,
    client: !access.blocked && !access.delayed && client ? { firstName: client.firstName, lastInitial: client.lastName.charAt(0) } : null,
    // La clave existe siempre para que el contrato sea estable; su contenido es null hasta que corresponde.
    contact: !access.blocked && !access.delayed && contactShared
      ? {
          fullName: `${client.firstName} ${client.lastName}`,
          phone: client.phone,
          exactAddress: r.exactAddress,
          location: privateLocation(r),
        }
      : null,
  };
}
