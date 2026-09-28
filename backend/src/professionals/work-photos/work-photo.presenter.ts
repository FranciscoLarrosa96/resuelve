import { EntityManager } from 'typeorm';
import { ProfessionalWorkPhoto } from './work-photo.entity';

/** DTO público de una foto: sin publicId ni datos internos. */
export function presentWorkPhoto(p: ProfessionalWorkPhoto) {
  return { id: p.id, url: p.imageUrl, caption: p.caption, sortOrder: p.sortOrder };
}

/** Fotos de un perfil en su orden (0 = primera). */
export function listWorkPhotos(m: EntityManager, professionalId: string): Promise<ProfessionalWorkPhoto[]> {
  return m.find(ProfessionalWorkPhoto, {
    where: { professionalId },
    order: { sortOrder: 'ASC', createdAt: 'ASC' },
  });
}
