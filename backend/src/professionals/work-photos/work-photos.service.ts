import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { DataSource, EntityManager, In } from 'typeorm';
import { AppException } from '../../common/errors/app-exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { AVATAR_STORAGE, AvatarStorage, WORK_PHOTO_DELIVERY } from '../avatar/avatar-storage';
import { ProfessionalProfile } from '../professional-profile.entity';
import { ProfessionalWorkPhoto } from './work-photo.entity';
import { listWorkPhotos, presentWorkPhoto } from './work-photo.presenter';
import {
  ALLOWED_WORK_PHOTO_FORMATS,
  MAX_WORK_PHOTO_BYTES,
  MAX_WORK_PHOTOS,
  captionProblem,
  normalizeCaption,
  workPhotoFolder,
} from './work-photo-rules';
import { resolveProfessionalEntitlements } from '../../plans/plan';

/**
 * "Trabajos realizados" del profesional (5 FREE / 20 PRO fotos activas).
 *
 * - Subida firmada directo a Cloudinary (mismo patrón que el avatar): el
 *   backend firma carpeta, nombre y formatos, y al confirmar consulta formato
 *   y peso REALES al proveedor. El API Secret nunca sale del servidor.
 * - Los topes se garantizan bajo lock del perfil (`pessimistic_write`):
 *   dos confirmaciones simultáneas con 4 fotos → una entra y la otra 409.
 * - Solo el dueño opera (la ruta usa el perfil del token; una foto ajena → 403).
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

  /** Se llama también al presentar el perfil público: un downgrade oculta fotos sin borrarlas. */
  async ensurePlanArchive(profile: ProfessionalProfile): Promise<void> {
    const limit = resolveProfessionalEntitlements(profile).portfolioPhotoLimit;
    if (limit >= MAX_WORK_PHOTOS) return;
    await this.dataSource.transaction(async (m) => {
      const current = await this.lockProfile(m, profile.id);
      await this.archiveOverflow(m, current, this.photoLimit(current));
    });
  }

  /** Firma de subida. Si no queda lugar activo o almacenado, avisa antes de subir. */
  async uploadTicket(profile: ProfessionalProfile) {
    this.assertStorage();
    await this.ensurePlanArchive(profile);
    const photos = await listWorkPhotos(this.dataSource.manager, profile.id);
    const current = await this.dataSource.getRepository(ProfessionalProfile).findOneByOrFail({ id: profile.id });
    this.assertCapacity(current, photos);
    return this.storage.createUploadTicket(workPhotoFolder(profile.id), MAX_WORK_PHOTO_BYTES);
  }

  /** Confirma una foto subida: valida con el proveedor y aplica el límite de plan actual. */
  async add(profile: ProfessionalProfile, publicId: string, rawCaption?: string | null) {
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

    const outcome = await this.dataSource.transaction(async (m) => {
      const current = await this.lockProfile(m, profile.id);
      await this.archiveOverflow(m, current, this.photoLimit(current));
      // Reintento de la misma confirmación: idempotente.
      if (await m.exists(ProfessionalWorkPhoto, { where: { publicId: stored.publicId } })) return 'ok' as const;
      const photos = await listWorkPhotos(m, profile.id);
      try {
        this.assertCapacity(current, photos);
      } catch {
        return 'full' as const;
      }
      await m.insert(ProfessionalWorkPhoto, {
        professionalId: profile.id,
        publicId: stored.publicId,
        imageUrl: this.storage.deliveryUrl(stored, WORK_PHOTO_DELIVERY),
        sortOrder: photos.length ? Math.max(...photos.map((p) => p.sortOrder)) + 1 : 0,
        caption,
      });
      return 'ok' as const;
    });
    if (outcome === 'full') {
      // Subió de más (dos pestañas): la foto no queda huérfana en Cloudinary.
      this.forget(stored.publicId);
      const current = await this.dataSource.getRepository(ProfessionalProfile).findOneByOrFail({ id: profile.id });
      const photos = await listWorkPhotos(this.dataSource.manager, profile.id);
      throw this.limitReached(this.photoLimit(current), photos.filter((photo) => !photo.archivedByPlan).length, photos.length);
    }
    return this.list(profile);
  }

  async updateCaption(profile: ProfessionalProfile, id: string, rawCaption: string | null) {
    const caption = this.validCaption(rawCaption);
    await this.dataSource.transaction(async (m) => {
      const current = await this.lockProfile(m, profile.id);
      await this.archiveOverflow(m, current, this.photoLimit(current));
      const photo = await this.owned(m, profile, id);
      await m.update(ProfessionalWorkPhoto, photo.id, { caption });
    });
    return this.list(profile);
  }

  /**
   * Borra primero en Cloudinary y recién después la fila, dentro de la misma
   * transacción: si el proveedor falla, la foto sigue en el perfil y se puede
   * reintentar (nunca una fila que apunta a un archivo borrado ni un archivo
   * público huérfano sin avisar).
   */
  async remove(profile: ProfessionalProfile, id: string) {
    await this.dataSource.transaction(async (m) => {
      const current = await this.lockProfile(m, profile.id);
      await this.archiveOverflow(m, current, this.photoLimit(current));
      const photo = await this.owned(m, profile, id);
      if (this.storage.configured) {
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
      await m.delete(ProfessionalWorkPhoto, photo.id);
      await this.renumber(m, (await listWorkPhotos(m, profile.id)).map((p) => p.id));
    });
    return this.list(profile);
  }

  /** Nuevo orden: exactamente las fotos del perfil, sin repetir. */
  async reorder(profile: ProfessionalProfile, ids: string[]) {
    await this.dataSource.transaction(async (m) => {
      const lockedProfile = await this.lockProfile(m, profile.id);
      await this.archiveOverflow(m, lockedProfile, this.photoLimit(lockedProfile));
      const current = (await listWorkPhotos(m, profile.id)).map((p) => p.id);
      const same = ids.length === current.length && new Set(ids).size === ids.length && ids.every((id) => current.includes(id));
      if (!same)
        throw AppException.unprocessable(
          ErrorCode.INVALID_WORK_PHOTO_ORDER,
          'El orden tiene que incluir todas tus fotos una sola vez',
        );
      await this.renumber(m, ids);
    });
    return this.list(profile);
  }

  /** Reactivación explícita de una foto guardada tras un downgrade. */
  async restore(profile: ProfessionalProfile, id: string) {
    await this.dataSource.transaction(async (m) => {
      const current = await this.lockProfile(m, profile.id);
      const limit = this.photoLimit(current);
      await this.archiveOverflow(m, current, limit);
      const photo = await this.owned(m, profile, id);
      if (!photo.archivedByPlan) return;
      const photos = await listWorkPhotos(m, profile.id);
      const activeCount = photos.filter((p) => !p.archivedByPlan).length;
      if (activeCount >= limit) throw this.limitReached(limit, activeCount, photos.length);
      await m.update(ProfessionalWorkPhoto, photo.id, {
        archivedByPlan: false,
        sortOrder: photos.length ? Math.max(...photos.map((p) => p.sortOrder)) + 1 : 0,
      });
    });
    return this.list(profile);
  }

  /** Una sola foto principal; una archivada primero debe reactivarse. */
  async setFeatured(profile: ProfessionalProfile, id: string, featured: boolean) {
    await this.dataSource.transaction(async (m) => {
      const current = await this.lockProfile(m, profile.id);
      await this.archiveOverflow(m, current, this.photoLimit(current));
      const photo = await this.owned(m, profile, id);
      if (featured && photo.archivedByPlan)
        throw AppException.conflict(ErrorCode.WORK_PHOTOS_LIMIT_REACHED, 'Reactivá la foto antes de destacarla');
      if (featured) await m.update(ProfessionalWorkPhoto, { professionalId: profile.id, featured: true }, { featured: false });
      await m.update(ProfessionalWorkPhoto, photo.id, { featured });
    });
    return this.list(profile);
  }

  private async present(m: EntityManager, professionalId: string) {
    const photos = await listWorkPhotos(m, professionalId);
    const max = await this.photoLimitById(m, professionalId);
    const activeCount = photos.filter((p) => !p.archivedByPlan).length;
    return { items: photos.map(presentWorkPhoto), max, activeCount, maxStored: MAX_WORK_PHOTOS, maxBytes: MAX_WORK_PHOTO_BYTES };
  }

  private async archiveOverflow(m: EntityManager, profile: ProfessionalProfile, limit: number): Promise<void> {
    const active = (await listWorkPhotos(m, profile.id)).filter((photo) => !photo.archivedByPlan);
    const overflow = active.slice(limit);
    if (!overflow.length) return;
    const ids = overflow.map((photo) => photo.id);
    await m.update(ProfessionalWorkPhoto, { id: In(ids) }, { archivedByPlan: true, featured: false });
  }

  private async photoLimitById(m: EntityManager, professionalId: string): Promise<number> {
    const profile = await m.findOneByOrFail(ProfessionalProfile, { id: professionalId });
    return this.photoLimit(profile);
  }

  private photoLimit(profile: ProfessionalProfile): number {
    return resolveProfessionalEntitlements(profile).portfolioPhotoLimit;
  }

  private assertCapacity(profile: ProfessionalProfile, photos: ProfessionalWorkPhoto[]): void {
    const activeCount = photos.filter((photo) => !photo.archivedByPlan).length;
    const limit = this.photoLimit(profile);
    if (activeCount >= limit || photos.length >= MAX_WORK_PHOTOS)
      throw this.limitReached(limit, activeCount, photos.length);
  }

  private async renumber(m: EntityManager, ids: string[]): Promise<void> {
    for (const [i, id] of ids.entries()) await m.update(ProfessionalWorkPhoto, id, { sortOrder: i });
  }

  /** Foto del perfil del token; de otro perfil → 403, inexistente → 404. */
  private async owned(m: EntityManager, profile: ProfessionalProfile, id: string): Promise<ProfessionalWorkPhoto> {
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

  private limitReached(max: number, activeCount = max, storedCount = 0): AppException {
    return AppException.conflict(
      ErrorCode.WORK_PHOTOS_LIMIT_REACHED,
      `Ya alcanzaste el máximo de ${max} fotos activas.`,
      { max, activeCount, maxStored: MAX_WORK_PHOTOS, storedCount },
    );
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
