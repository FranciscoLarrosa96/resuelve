import type { FindOptionsRelations } from 'typeorm';
import type { ServiceRequest } from './service-request.entity';

/** Relaciones necesarias para serializar una solicitud (cliente o profesional). */
export const REQUEST_RELATIONS: FindOptionsRelations<ServiceRequest> = {
  service: true,
  zone: true,
  photos: true,
  client: true,
  invitations: { professional: { user: true } },
};
