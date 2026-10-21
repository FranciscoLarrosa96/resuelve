import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { DataSource, EntityManager, In } from 'typeorm';
import { AppException } from '../../common/errors/app-exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { AVATAR_STORAGE, AvatarStorage, WORK_PHOTO_DELIVERY } from '../avatar/avatar-storage';
import { ProfessionalProfile } from '../professional-profile.entity';
import { ProfessionalWorkPhoto } from './work-photo.entity';
import { ProfessionalWork } from './work.entity';
import { listWorkPhotos, listWorks, presentWork } from './work-photo.presenter';
import {
  ALLOWED_WORK_PHOTO_FORMATS,
  MAX_STORED_WORKS,
  MAX_WORK_PHOTO_BYTES,
  PHOTOS_PER_WORK,
  captionProblem,
  normalizeCaption,
  workDescriptionProblem,
  workMonthProblem,
  workMonthToDate,
  workPhotoFolder,
  workTitleProblem,
} from './work-photo-rules';
import { resolveProfessionalEntitlements } from '../../plans/plan';

export interface WorkInput {
  title?: string;
  description?: string | null;
  doneOn?: string;
  pinned?: boolean;
  beforePhotoId?: string | null;
  afterPhotoId?: string | null;
}

/**
 * "Trabajos realizados" del profesional: trabajos (Free 0 / PRO 30 activos)
 * con hasta 5 fotos cada uno.
 *
 * - Subida firmada directo a Cloudinary (mismo patrón que el avatar): el
 *   backend firma carpeta, nombre y formatos, y al confirmar consulta formato
 *   y peso REALES al proveedor. El API Secret nunca sale del servidor.
 * - Los topes se garantizan bajo lock del perfil (`pessimistic_write`):
 *   dos confirmaciones simultáneas con 4 fotos → una entra y la otra 409.
 * - Downgrade a Free: todos quedan archivados (ocultos, nunca borrados).
 *   Con acceso PRO nuevamente, el dueño elige cuáles reactivar.
 * - Solo el dueño opera (la ruta usa el perfil del token; algo ajeno → 403).
 * - Toda respuesta privada es la lista completa (`present`).
 */
@Injectable()
export class WorkPhotosService {
  private readonly logger = new Logger(WorkPhotosService.name);

  constructor(
    private readonly dataSource: DataSource,
    @Inject(AVATAR_STORAGE) private readonly storage: AvatarStorage,
  ) {}

  async list(profile: ProfessionalProfile) {
    await this.ensurePlanArchive(profile);
    return this.present(this.dataSource.manager, profile.id);
  }

  /** Se llama también al presentar el perfil público: un downgrade oculta trabajos y fotos sin borrarlos. */
  async ensurePlanArchive(profile: ProfessionalProfile): Promise<void> {
    if (!this.isFree(profile)) {
      const works = await listWorks(this.dataSource.manager, profile.id);
      if (works.filter((w) => !w.archivedByPlan).length <= this.workLimit(profile)) return;
    }
    await this.dataSource.transaction(async (m) => {
      await this.archiveOverflow(m, await this.lockProfile(m, profile.id));
    });
  }

  // ---- Trabajos --------------------------------------------------------------

  async createWork(profile: ProfessionalProfile, input: WorkInput) {
    const fields = this.validWork(input, true);
    await this.dataSource.transaction(async (m) => {
      const current = await this.lockProfile(m, profile.id);
      this.assertPortfolio(current);
      await this.archiveOverflow(m, current);
      const works = await listWorks(m, profile.id);
      const active = works.filter((w) => !w.archivedByPlan).length;
      const limit = this.workLimit(current);
      if (active >= limit || works.length >= MAX_STORED_WORKS) throw this.worksLimit(limit, active);
      await m.insert(ProfessionalWork, { professionalId: profile.id, ...fields } as Partial<ProfessionalWork>);
    });
    return this.list(profile);
  }

  async updateWork(profile: ProfessionalProfile, id: string, input: WorkInput) {
    const fields = this.validWork(input, false);
    await this.dataSource.transaction(async (m) => {
      const current = await this.lockProfile(m, profile.id);
      await this.archiveOverflow(m, current);
      const work = await this.ownedWork(m, profile, id);
      const rights = resolveProfessionalEntitlements(current);
      if (input.pinned !== undefined) {
        if (input.pinned && !rights.canPinWorks) throw AppException.forbidden('Fijar trabajos requiere PRO');
        if (input.pinned && !work.pinned) {
          const count = await m.count(ProfessionalWork, { where: { professionalId: profile.id, pinned: true, archivedByPlan: false } });
          if (work.archivedByPlan || count >= 3) throw AppException.conflict(ErrorCode.WORKS_LIMIT_REACHED, 'Podés fijar hasta 3 trabajos activos.');
        }
        Object.assign(fields, { pinned: input.pinned });
      }
      if (input.beforePhotoId !== undefined || input.afterPhotoId !== undefined) {
        const before = input.beforePhotoId !== undefined ? input.beforePhotoId : work.beforePhotoId;
        const after = input.afterPhotoId !== undefined ? input.afterPhotoId : work.afterPhotoId;
        if ((before || after) && !rights.canUseBeforeAfter) throw AppException.forbidden('Antes y después requiere PRO');
        const photos = await listWorkPhotos(m, profile.id, work.id);
        if (!!before !== !!after || (before && (before === after || ![before, after].every((id) => photos.some((p) => p.id === id && !p.archivedByPlan)))))
          throw AppException.unprocessable(ErrorCode.INVALID_WORK, 'Elegí dos fotos distintas de este trabajo, o quitá las dos.');
        Object.assign(fields, { beforePhotoId: before, afterPhotoId: after });
      }
      if (Object.keys(fields).length) await m.update(ProfessionalWork, work.id, fields);
    });
    return this.list(profile);
  }

  /**
   * Borra el trabajo con todas sus fotos. Cada foto: primero Cloudinary y
   * después su fila, en su propia transacción; si el proveedor falla, quedan
   * el trabajo y las fotos que faltan (reintentable), nunca filas que apuntan
   * a archivos borrados.
   */
  async removeWork(profile: ProfessionalProfile, id: string) {
    const work = await this.ownedWork(this.dataSource.manager, profile, id);
    for (const photo of await listWorkPhotos(this.dataSource.manager, profile.id, work.id)) {
      await this.dataSource.transaction(async (m) => {
        await this.lockProfile(m, profile.id);
        if (!(await m.exists(ProfessionalWorkPhoto, { where: { id: photo.id } }))) return;
        await this.destroyFile(photo);
        await this.clearComparison(m, photo.id);
        await m.delete(ProfessionalWorkPhoto, photo.id);
      });
    }
    await this.dataSource.transaction(async (m) => {
      await this.lockProfile(m, profile.id);
      // Una foto que entró mientras tanto (otra pestaña) se borra con el trabajo en la próxima vuelta.
      if (await m.exists(ProfessionalWorkPhoto, { where: { workId: work.id } }))
        throw new AppException(ErrorCode.WORK_PHOTO_DELETE_FAILED, 'No pudimos borrar el trabajo. Probá de nuevo.', HttpStatus.CONFLICT);
      await m.delete(ProfessionalWork, work.id);
    });
    return this.list(profile);
  }

  /**
   * Vuelve a mostrar un trabajo archivado por plan. Si el plan ya no tiene
   * lugar, lo reemplaza: se archiva el último trabajo activo. Requiere acceso PRO.
   */
  async restoreWork(profile: ProfessionalProfile, id: string) {
    await this.dataSource.transaction(async (m) => {
      const current = await this.lockProfile(m, profile.id);
      await this.archiveOverflow(m, current);
      const work = await this.ownedWork(m, profile, id);
      this.assertPortfolio(current);
      if (!work.archivedByPlan) return;
      const active = (await listWorks(m, profile.id)).filter((w) => !w.archivedByPlan);
      const limit = this.workLimit(current);
      const replaced = active.slice(Math.max(0, limit - 1)).map((w) => w.id);
      if (replaced.length) await m.update(ProfessionalWork, { id: In(replaced) }, { archivedByPlan: true });
      const pinned = work.pinned && active.filter((w) => w.pinned && !replaced.includes(w.id)).length < 3;
      await m.update(ProfessionalWork, work.id, { archivedByPlan: false, pinned });
      await this.archiveOverflow(m, current);
    });
    return this.list(profile);
  }

  // ---- Fotos -----------------------------------------------------------------

  /** Firma de subida para un trabajo. Si el trabajo no tiene lugar, avisa antes de subir. */
  async uploadTicket(profile: ProfessionalProfile, workId: string) {
    this.assertPortfolio(profile);
    this.assertStorage();
    await this.ensurePlanArchive(profile);
    const work = await this.ownedWork(this.dataSource.manager, profile, workId);
    this.assertWorkRoom(work, await listWorkPhotos(this.dataSource.manager, profile.id, work.id));
    return this.storage.createUploadTicket(workPhotoFolder(profile.id), MAX_WORK_PHOTO_BYTES);
  }

  /** Confirma una foto subida: valida con el proveedor y la agrega al final del trabajo. */
  async addPhoto(profile: ProfessionalProfile, workId: string, publicId: string, rawCaption?: string | null) {
    this.assertPortfolio(profile);
    this.assertStorage();
    const caption = this.validCaption(rawCaption);
    if (!publicId.startsWith(`${workPhotoFolder(profile.id)}/`)) throw AppException.notFound('Foto');
    const stored = await this.storage.inspect(publicId);
    if (!stored) throw AppException.notFound('Foto');
    if (
      !(ALLOWED_WORK_PHOTO_FORMATS as readonly string[]).includes(stored.format) ||
      stored.bytes > MAX_WORK_PHOTO_BYTES
    ) {
      this.forget(publicId);
      throw AppException.unprocessable(ErrorCode.INVALID_IMAGE, 'La foto tiene que ser JPG, PNG o WebP de hasta 8 MB', {
        allowedFormats: ALLOWED_WORK_PHOTO_FORMATS,
        maxBytes: MAX_WORK_PHOTO_BYTES,
      });
    }

    let rejection: AppException | null = null;
    await this.dataSource.transaction(async (m) => {
      const current = await this.lockProfile(m, profile.id);
      await this.archiveOverflow(m, current);
      if (this.workLimit(current) === 0) {
        rejection = this.portfolioRequired();
        return;
      }
      // Reintento de la misma confirmación: idempotente.
      if (await m.exists(ProfessionalWorkPhoto, { where: { publicId: stored.publicId } })) return;
      const work = await this.ownedWork(m, profile, workId);
      const photos = await listWorkPhotos(m, profile.id, work.id);
      try {
        this.assertWorkRoom(work, photos);
      } catch (error) {
        rejection = error as AppException;
        return;
      }
      await m.insert(ProfessionalWorkPhoto, {
        professionalId: profile.id,
        workId: work.id,
        publicId: stored.publicId,
        imageUrl: this.storage.deliveryUrl(stored, WORK_PHOTO_DELIVERY),
        sortOrder: this.nextOrder(photos),
        caption,
      });
    });
    if (rejection) {
      // Subió de más (dos pestañas): la foto no queda huérfana en Cloudinary.
      this.forget(stored.publicId);
      throw rejection;
    }
    return this.list(profile);
  }

  async updateCaption(profile: ProfessionalProfile, id: string, rawCaption: string | null) {
    const caption = this.validCaption(rawCaption);
    await this.dataSource.transaction(async (m) => {
      await this.archiveOverflow(m, await this.lockProfile(m, profile.id));
      const photo = await this.ownedPhoto(m, profile, id);
      await m.update(ProfessionalWorkPhoto, photo.id, { caption });
    });
    return this.list(profile);
  }

  /** Pasa una foto a otro trabajo (activo y con lugar): queda al final y activa. */
  async movePhoto(profile: ProfessionalProfile, id: string, workId: string) {
    await this.dataSource.transaction(async (m) => {
      const current = await this.lockProfile(m, profile.id);
      await this.archiveOverflow(m, current);
      const photo = await this.ownedPhoto(m, profile, id);
      this.assertPortfolio(current);
      if (photo.workId === workId) return;
      const target = await this.ownedWork(m, profile, workId);
      const targetPhotos = await listWorkPhotos(m, profile.id, target.id);
      this.assertWorkRoom(target, targetPhotos);
      await this.clearComparison(m, photo.id);
      await m.update(ProfessionalWorkPhoto, photo.id, {
        workId: target.id,
        sortOrder: this.nextOrder(targetPhotos),
        archivedByPlan: false,
      });
      await this.renumber(m, (await listWorkPhotos(m, profile.id, photo.workId)).map((p) => p.id));
    });
    return this.list(profile);
  }

  /** Borra primero en Cloudinary y recién después la fila, dentro de la misma transacción (reintentable). */
  async removePhoto(profile: ProfessionalProfile, id: string) {
    await this.dataSource.transaction(async (m) => {
      await this.archiveOverflow(m, await this.lockProfile(m, profile.id));
      const photo = await this.ownedPhoto(m, profile, id);
      await this.destroyFile(photo);
      await this.clearComparison(m, photo.id);
      await m.delete(ProfessionalWorkPhoto, photo.id);
      await this.renumber(m, (await listWorkPhotos(m, profile.id, photo.workId)).map((p) => p.id));
    });
    return this.list(profile);
  }

  /** Nuevo orden de un trabajo: exactamente sus fotos, sin repetir. La primera es la portada. */
  async reorder(profile: ProfessionalProfile, workId: string, ids: string[]) {
    await this.dataSource.transaction(async (m) => {
      await this.archiveOverflow(m, await this.lockProfile(m, profile.id));
      const work = await this.ownedWork(m, profile, workId);
      const current = (await listWorkPhotos(m, profile.id, work.id)).map((p) => p.id);
      const same = ids.length === current.length && new Set(ids).size === ids.length && ids.every((id) => current.includes(id));
      if (!same)
        throw AppException.unprocessable(
          ErrorCode.INVALID_WORK_PHOTO_ORDER,
          'El orden tiene que incluir todas las fotos del trabajo una sola vez',
        );
      await this.renumber(m, ids);
    });
    return this.list(profile);
  }

  /** Reactivación explícita de una foto archivada por plan (si el trabajo tiene lugar). */
  async restorePhoto(profile: ProfessionalProfile, id: string) {
    await this.dataSource.transaction(async (m) => {
      const current = await this.lockProfile(m, profile.id);
      await this.archiveOverflow(m, current);
      const photo = await this.ownedPhoto(m, profile, id);
      this.assertPortfolio(current);
      if (!photo.archivedByPlan) return;
      const work = await this.ownedWork(m, profile, photo.workId);
      const photos = await listWorkPhotos(m, profile.id, work.id);
      const active = photos.filter((p) => !p.archivedByPlan).length;
      if (work.archivedByPlan || active >= PHOTOS_PER_WORK) throw this.photosLimit(work);
      await m.update(ProfessionalWorkPhoto, photo.id, { archivedByPlan: false, sortOrder: this.nextOrder(photos) });
    });
    return this.list(profile);
  }

  // ---- Internos --------------------------------------------------------------

  private async present(m: EntityManager, professionalId: string) {
    const [works, photos, profile] = await Promise.all([
      listWorks(m, professionalId),
      listWorkPhotos(m, professionalId),
      m.findOneByOrFail(ProfessionalProfile, { id: professionalId }),
    ]);
    const active = works.filter((w) => !w.archivedByPlan);
    return {
      items: works.map((work) => presentWork(work, photos)),
      /** Trabajos activos permitidos por el plan (Free 0 / PRO 30). */
      maxWorks: this.workLimit(profile),
      activeWorks: active.length,
      maxStoredWorks: MAX_STORED_WORKS,
      photosPerWork: PHOTOS_PER_WORK,
      /** Fotos visibles en el perfil público (trabajos activos, fotos activas). */
      activePhotos: photos.filter((p) => !p.archivedByPlan && active.some((w) => w.id === p.workId)).length,
      maxBytes: MAX_WORK_PHOTO_BYTES,
    };
  }

  /**
   * Aplica el plan actual: trabajos activos más allá del límite (los más
   * viejos) → archivados; en Free quedan todos ocultos.
   * Nunca borra nada y nunca reactiva solo (eso es del dueño).
   */
  private async archiveOverflow(m: EntityManager, profile: ProfessionalProfile): Promise<void> {
    const works = await listWorks(m, profile.id);
    const active = works.filter((w) => !w.archivedByPlan);
    const overflow = active.slice(this.workLimit(profile)).map((w) => w.id);
    if (overflow.length) await m.update(ProfessionalWork, { id: In(overflow) }, { archivedByPlan: true });
  }

  private async clearComparison(m: EntityManager, photoId: string) {
    await m.query(`UPDATE professional_works SET before_photo_id = NULL, after_photo_id = NULL WHERE before_photo_id = $1 OR after_photo_id = $1`, [photoId]);
  }

  private workLimit(profile: ProfessionalProfile): number {
    return resolveProfessionalEntitlements(profile).portfolioWorkLimit;
  }

  private isFree(profile: ProfessionalProfile): boolean {
    return this.workLimit(profile) === 0;
  }

  private portfolioRequired(): AppException {
    return new AppException(ErrorCode.PRO_REQUIRED, 'Publicar trabajos con fotos requiere Resuelve PRO.', HttpStatus.FORBIDDEN);
  }

  private assertPortfolio(profile: ProfessionalProfile): void {
    if (this.workLimit(profile) === 0) throw this.portfolioRequired();
  }

  /** Un trabajo recibe fotos si está activo y tiene menos de 5 (contando las archivadas). */
  private assertWorkRoom(work: ProfessionalWork, photos: ProfessionalWorkPhoto[]): void {
    if (work.archivedByPlan || photos.length >= PHOTOS_PER_WORK) throw this.photosLimit(work, photos.length);
  }

  private nextOrder(photos: ProfessionalWorkPhoto[]): number {
    return photos.length ? Math.max(...photos.map((p) => p.sortOrder)) + 1 : 0;
  }

  private async renumber(m: EntityManager, ids: string[]): Promise<void> {
    for (const [i, id] of ids.entries()) await m.update(ProfessionalWorkPhoto, id, { sortOrder: i });
  }

  /** Trabajo del perfil del token; de otro perfil → 403, inexistente → 404. */
  private async ownedWork(m: EntityManager, profile: ProfessionalProfile, id: string): Promise<ProfessionalWork> {
    const work = await m.findOne(ProfessionalWork, { where: { id } });
    if (!work) throw AppException.notFound('Trabajo');
    if (work.professionalId !== profile.id) throw AppException.forbidden('Este trabajo no es de tu perfil');
    return work;
  }

  /** Foto del perfil del token; de otro perfil → 403, inexistente → 404. */
  private async ownedPhoto(m: EntityManager, profile: ProfessionalProfile, id: string): Promise<ProfessionalWorkPhoto> {
    const photo = await m.findOne(ProfessionalWorkPhoto, { where: { id } });
    if (!photo) throw AppException.notFound('Foto');
    if (photo.professionalId !== profile.id) throw AppException.forbidden('Esta foto no es de tu perfil');
    return photo;
  }

  private lockProfile(m: EntityManager, professionalId: string) {
    return m.findOneOrFail(ProfessionalProfile, { where: { id: professionalId }, lock: { mode: 'pessimistic_write' } });
  }

  private validCaption(raw: string | null | undefined): string | null {
    const caption = normalizeCaption(raw);
    const problem = captionProblem(caption);
    if (problem) throw AppException.unprocessable(ErrorCode.INVALID_CAPTION, problem);
    return caption;
  }

  /** Campos válidos del trabajo (`required` = alta: nombre y fecha obligatorios). */
  private validWork(input: WorkInput, required: boolean): Partial<Pick<ProfessionalWork, 'title' | 'description' | 'doneOn'>> {
    const fields: Partial<Pick<ProfessionalWork, 'title' | 'description' | 'doneOn'>> = {};
    const invalid = (message: string, field: string) =>
      AppException.unprocessable(ErrorCode.INVALID_WORK, message, { field });
    if (required || input.title !== undefined) {
      const title = normalizeCaption(input.title);
      const problem = workTitleProblem(title);
      if (problem) throw invalid(problem, 'title');
      fields.title = title!;
    }
    if (input.description !== undefined) {
      const description = normalizeCaption(input.description);
      const problem = workDescriptionProblem(description);
      if (problem) throw invalid(problem, 'description');
      fields.description = description;
    }
    if (required || input.doneOn !== undefined) {
      const problem = workMonthProblem(input.doneOn ?? '');
      if (problem) throw invalid(problem, 'doneOn');
      fields.doneOn = workMonthToDate(input.doneOn!);
    }
    return fields;
  }

  private worksLimit(max: number, activeCount: number): AppException {
    return AppException.conflict(
      ErrorCode.WORKS_LIMIT_REACHED,
      `Ya tenés el máximo de ${max} trabajos.`,
      { max, activeCount, maxStored: MAX_STORED_WORKS },
    );
  }

  private photosLimit(work: ProfessionalWork, count = PHOTOS_PER_WORK): AppException {
    return AppException.conflict(
      ErrorCode.WORK_PHOTOS_LIMIT_REACHED,
      work.archivedByPlan
        ? 'Este trabajo está archivado por tu plan. Volvé a mostrarlo para sumarle fotos.'
        : `Cada trabajo puede tener hasta ${PHOTOS_PER_WORK} fotos.`,
      { max: PHOTOS_PER_WORK, count, workId: work.id },
    );
  }

  /** Borra el archivo de una foto (si Cloudinary falla → 502 y la foto sigue). */
  private async destroyFile(photo: ProfessionalWorkPhoto): Promise<void> {
    if (!this.storage.configured) return;
    try {
      await this.storage.destroy(photo.publicId);
    } catch (error) {
      this.logger.warn(`No se pudo borrar la foto de trabajo ${photo.id}: ${(error as Error).message}`);
      throw new AppException(
        ErrorCode.WORK_PHOTO_DELETE_FAILED,
        'No pudimos borrar la foto. Probá de nuevo en unos minutos.',
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  /** Borra del proveedor sin bloquear la respuesta (si falla, se loguea). */
  private forget(publicId: string): void {
    this.storage.destroy(publicId).catch(() => this.logger.warn('No se pudo borrar una foto de trabajo rechazada'));
  }

  private assertStorage(): void {
    if (!this.storage.configured)
      throw new AppException(
        ErrorCode.UPLOADS_NOT_CONFIGURED,
        'La carga de fotos todavía no está disponible',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
  }
}
