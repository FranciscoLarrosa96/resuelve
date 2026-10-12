import { EntityManager } from 'typeorm';
import { ProfessionalWorkPhoto } from './work-photo.entity';
import { ProfessionalWork } from './work.entity';
import { dateToWorkMonth } from './work-photo-rules';

/** Foto en la respuesta privada (Mi perfil): sin publicId ni datos internos. */
export function presentWorkPhoto(p: ProfessionalWorkPhoto) {
  return { id: p.id, url: p.imageUrl, caption: p.caption, sortOrder: p.sortOrder, archivedByPlan: p.archivedByPlan };
}

/** Trabajo en la respuesta privada, con todas sus fotos (también las archivadas por plan). */
export function presentWork(work: ProfessionalWork, photos: ProfessionalWorkPhoto[]) {
  return {
    id: work.id,
    title: work.title,
    description: work.description,
    /** "2026-03" (mes y año). */
    doneOn: dateToWorkMonth(work.doneOn),
    archivedByPlan: work.archivedByPlan,
    photos: photos.filter((p) => p.workId === work.id).map(presentWorkPhoto),
  };
}

/**
 * Trabajos del perfil público: solo los activos y con al menos una foto activa,
 * del más reciente al más viejo; la primera foto es la portada.
 */
export function presentPublicWorks(works: ProfessionalWork[], photos: ProfessionalWorkPhoto[]) {
  return works
    .filter((work) => !work.archivedByPlan)
    .map((work) => ({
      id: work.id,
      title: work.title,
      description: work.description,
      doneOn: dateToWorkMonth(work.doneOn),
      photos: photos
        .filter((p) => p.workId === work.id && !p.archivedByPlan)
        .map((p) => ({ id: p.id, url: p.imageUrl, caption: p.caption, sortOrder: p.sortOrder })),
    }))
    .filter((work) => work.photos.length > 0);
}

/** Trabajos de un perfil, del más reciente al más viejo. */
export function listWorks(m: EntityManager, professionalId: string): Promise<ProfessionalWork[]> {
  return m.find(ProfessionalWork, { where: { professionalId }, order: { doneOn: 'DESC', createdAt: 'DESC' } });
}

/** Fotos de un perfil (o de un trabajo) en su orden (0 = portada). */
export function listWorkPhotos(
  m: EntityManager,
  professionalId: string,
  workId?: string,
): Promise<ProfessionalWorkPhoto[]> {
  return m.find(ProfessionalWorkPhoto, {
    where: workId ? { professionalId, workId } : { professionalId },
    order: { sortOrder: 'ASC', createdAt: 'ASC' },
  });
}
