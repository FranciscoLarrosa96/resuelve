import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppException } from '../../common/errors/app-exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { effectivePlan } from '../../plans/plan';
import { PlanTier } from '../professional.enums';
import { ProfessionalProfile } from '../professional-profile.entity';
import { ProfessionalsService } from '../professionals.service';
import {
  ALLOWED_AVATAR_FORMATS,
  AVATAR_STORAGE,
  AvatarStorage,
  COVER_DELIVERY,
  MAX_COVER_BYTES,
  coverFolder,
} from './avatar-storage';

/**
 * Foto de portada del perfil público: beneficio PRO. Subir o cambiarla pide PRO
 * vigente (403 `PRO_REQUIRED`); quitarla, nunca. Al bajar a Free queda guardada y
 * sin publicarse (`presentPublicProfessional`), igual que los trabajos archivados.
 */
@Injectable()
export class ProfessionalCoverService {
  private readonly logger = new Logger(ProfessionalCoverService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly professionals: ProfessionalsService,
    @Inject(AVATAR_STORAGE) private readonly storage: AvatarStorage,
  ) {}

  uploadTicket(profile: ProfessionalProfile) {
    this.assertPro(profile);
    this.assertStorage();
    return this.storage.createUploadTicket(coverFolder(profile.id), MAX_COVER_BYTES);
  }

  /** Confirma la portada subida (su carpeta, formato y peso reales); reemplaza la anterior. */
  async set(profile: ProfessionalProfile, publicId: string) {
    this.assertPro(profile);
    this.assertStorage();
    if (!publicId.startsWith(`${coverFolder(profile.id)}/`)) throw AppException.notFound('Foto');
    const stored = await this.storage.inspect(publicId);
    if (!stored) throw AppException.notFound('Foto');
    if (!(ALLOWED_AVATAR_FORMATS as readonly string[]).includes(stored.format) || stored.bytes > MAX_COVER_BYTES) {
      await this.storage.destroy(publicId).catch(() => undefined);
      throw AppException.unprocessable(ErrorCode.INVALID_IMAGE, 'La portada tiene que ser JPG, PNG o WebP de hasta 8 MB', {
        allowedFormats: ALLOWED_AVATAR_FORMATS,
        maxBytes: MAX_COVER_BYTES,
      });
    }
    const previous = await this.replace(profile.id, {
      coverPublicId: stored.publicId,
      coverUrl: this.storage.deliveryUrl(stored, COVER_DELIVERY),
    });
    if (previous && previous !== stored.publicId) this.forget(previous);
    return this.professionals.getOwn(profile.id);
  }

  /** "Quitar portada": también sin PRO (es su contenido). */
  async remove(profile: ProfessionalProfile) {
    const previous = await this.replace(profile.id, { coverPublicId: null, coverUrl: null });
    if (previous && this.storage.configured) this.forget(previous);
    return this.professionals.getOwn(profile.id);
  }

  private replace(
    professionalId: string,
    patch: Pick<ProfessionalProfile, 'coverPublicId' | 'coverUrl'>,
  ): Promise<string | null> {
    return this.dataSource.transaction(async (m) => {
      const current = await m.findOneOrFail(ProfessionalProfile, {
        where: { id: professionalId },
        lock: { mode: 'pessimistic_write' },
      });
      await m.update(ProfessionalProfile, professionalId, patch);
      return current.coverPublicId;
    });
  }

  private forget(publicId: string): void {
    this.storage.destroy(publicId).catch(() => this.logger.warn('No se pudo borrar una portada anterior'));
  }

  private assertPro(profile: ProfessionalProfile): void {
    if (effectivePlan(profile) === PlanTier.FREE) {
      throw new AppException(ErrorCode.PRO_REQUIRED, 'La foto de portada es parte de Resuelve PRO', HttpStatus.FORBIDDEN);
    }
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
