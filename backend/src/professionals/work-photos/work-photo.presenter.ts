import { EntityManager } from 'typeorm';
import { ProfessionalWorkPhoto } from './work-photo.entity';

/** DTO público de una foto: sin publicId ni datos internos. */
export function presentWorkPhoto(p: ProfessionalWorkPhoto) {
  return {
    id: p.id,
    url: p.imageUrl,
    caption: p.caption,
    sortOrder: p.sortOrder,
    archivedByPlan: p.archivedByPlan,
    featured: p.featured,
  };
}

/** Only public, plan-active photos are included in the professional profile. */
export function presentPublicWorkPhoto(p: ProfessionalWorkPhoto) {
  return { id: p.id, url: p.imageUrl, caption: p.caption, sortOrder: p.sortOrder, featured: p.featured };
}

/** Fotos de un perfil en su orden (0 = primera). */
export function listWorkPhotos(m: EntityManager, professionalId: string): Promise<ProfessionalWorkPhoto[]> {
  return m.find(ProfessionalWorkPhoto, {
    where: { professionalId },
    order: { sortOrder: 'ASC', createdAt: 'ASC' },
  });
}
