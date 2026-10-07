import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';
import { AppException } from '../common/errors/app-exception';
import { ErrorCode } from '../common/errors/error-codes';
import { recalculateProfessionalMetrics } from '../professionals/professional-metrics';
import { AVATAR_STORAGE, AvatarStorage } from '../professionals/avatar/avatar-storage';
import { DOCUMENT_STORAGE, DocumentStorage } from '../verifications/document-storage';
import {
  ACTIVE_JOB_STATUSES,
  ACTIVE_REQUEST_STATUSES,
  AUTO_CANCELLED_REQUEST_STATUSES,
  DELETED_FIRST_NAME,
  DELETED_LAST_NAME,
  DELETED_REQUEST_DESCRIPTION,
  DeletionBlock,
  deletedEmail,
  deletedSlug,
  deletionBlockers,
} from './account-deletion';

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  deleted_at: Date | null;
}

/**
 * Baja de cuenta del propio usuario. Anonimiza (nunca borra la fila: las
 * claves hacia `users` son CASCADE y arrastrarían el historial de otras
 * personas), cierra lo que quedó abierto y borra fotos y documentos.
 * Todo en una transacción: si falla un archivo, no cambia nada.
 */
@Injectable()
export class AccountService {
  private readonly logger = new Logger('Account');

  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    @Inject(AVATAR_STORAGE) private readonly photos: AvatarStorage,
    @Inject(DOCUMENT_STORAGE) private readonly documents: DocumentStorage,
  ) {}

  /** Qué impide la baja ahora mismo (lista vacía = se puede). */
  async check(userId: string): Promise<{ canDelete: boolean; blockers: DeletionBlock[] }> {
    const blockers = await this.blockers(this.dataSource.manager, userId);
    return { canDelete: blockers.length === 0, blockers };
  }

  async delete(userId: string, password: string): Promise<{ deleted: true }> {
    const user = await this.findUser(userId);
    if (user.deleted_at) return { deleted: true }; // ya dada de baja (token todavía vigente)

    const valid = await argon2.verify(user.password_hash, password).catch(() => false);
    if (!valid) {
      // 403, nunca 401: el frontend cierra la sesión ante un 401 y acá la persona sigue autenticada.
      throw AppException.forbidden('La contraseña no es correcta.', ErrorCode.ACCOUNT_PASSWORD_INCORRECT);
    }
    return this.anonymize(user, 'self');
  }

  /** Baja hecha desde el panel admin: mismas reglas, bloqueos y anonimización, sin contraseña. */
  async deleteAsAdmin(userId: string): Promise<{ deleted: true }> {
    const user = await this.findUser(userId);
    if (user.deleted_at) return { deleted: true };
    return this.anonymize(user, 'admin');
  }

  /**
   * Borrado DEFINITIVO (solo panel admin, pensado para cuentas de prueba): la
   * fila se va y el CASCADE se lleva todo lo que cuelga de ella, también lo
   * que compartió con otras personas (presupuestos, trabajos, reseñas). Para
   * una persona real está `deleteAsAdmin`, que conserva el historial ajeno.
   * Archivos primero y dentro de la transacción: si Cloudinary falla, no cambia nada.
   */
  async purge(userId: string): Promise<{ purged: true }> {
    const summary = await this.dataSource.transaction(async (m) => {
      const [user] = await m.query<{ id: string; email: string }[]>(
        `SELECT id, email FROM users WHERE id = $1 FOR UPDATE`,
        [userId],
      );
      if (!user) throw AppException.notFound('Usuario');
      const [profile] = await m.query<{ id: string }[]>(
        `SELECT id FROM professional_profiles WHERE user_id = $1 FOR UPDATE`,
        [userId],
      );
      const profileId = profile?.id ?? null;
      // Profesionales cuyo rating o trabajos hechos dependen de esta cuenta como cliente.
      const touched = await m.query<{ id: string }[]>(
        `SELECT professional_id AS id FROM reviews WHERE client_id = $1
         UNION
         SELECT selected_professional_id FROM service_requests
          WHERE client_id = $1 AND selected_professional_id IS NOT NULL`,
        [userId],
      );
      if (profileId) await this.destroyProfessionalFiles(m, profileId);

      // appointments.quote_id y jobs.accepted_quote_id son RESTRICT: frenarían el
      // CASCADE de los presupuestos, así que se borran antes y explícitamente.
      const quotes = `SELECT id FROM quotes
        WHERE professional_id = $2 OR request_id IN (SELECT id FROM service_requests WHERE client_id = $1)`;
      await m.query(`DELETE FROM appointments WHERE quote_id IN (${quotes})`, [userId, profileId]);
      await m.query(`DELETE FROM jobs WHERE accepted_quote_id IN (${quotes})`, [userId, profileId]);
      await m.query(`DELETE FROM pending_registrations WHERE lower(email) = lower($1)`, [user.email]);
      await m.query(`DELETE FROM users WHERE id = $1`, [userId]);

      for (const { id } of touched) {
        if (id !== profileId) await recalculateProfessionalMetrics(m, id);
      }
      return { professional: !!profileId, recalculated: touched.length };
    });
    // Sin email ni nombre: solo qué se hizo.
    this.logger.log(`account purged by=admin professional=${summary.professional} recalculated=${summary.recalculated}`);
    return { purged: true };
  }

  private async findUser(userId: string): Promise<UserRow> {
    const [user] = await this.dataSource.query<UserRow[]>(
      `SELECT id, email, password_hash, deleted_at FROM users WHERE id = $1`,
      [userId],
    );
    if (!user) throw AppException.notFound('Usuario');
    return user;
  }

  private async anonymize(user: UserRow, by: 'self' | 'admin'): Promise<{ deleted: true }> {
    const userId = user.id;
    const summary = await this.dataSource.transaction(async (m) => {
      await m.query(`SELECT id FROM users WHERE id = $1 FOR UPDATE`, [userId]);
      const [profile] = await m.query<{ id: string }[]>(
        `SELECT id FROM professional_profiles WHERE user_id = $1 FOR UPDATE`,
        [userId],
      );
      // Re-chequeo con los locks tomados: algo pudo cambiar desde el GET.
      const blockers = await this.blockers(m, userId);
      if (blockers.length) {
        throw AppException.conflict(
          ErrorCode.ACCOUNT_DELETE_BLOCKED,
          'Todavía no podés eliminar tu cuenta.',
          { blockers },
        );
      }
      const cancelled = await this.cancelOpenRequests(m, userId);
      if (profile) await this.closeProfessional(m, profile.id);
      await this.anonymizeUser(m, user);
      return { cancelledRequests: cancelled, professional: !!profile };
    });
    // Sin email, nombre ni ids de contraparte: solo qué se hizo.
    this.logger.log(
      `account deleted by=${by} professional=${summary.professional} cancelledRequests=${summary.cancelledRequests}`,
    );
    return { deleted: true };
  }

  // ---------------------------------------------------------------------------

  private async blockers(m: EntityManager, userId: string): Promise<DeletionBlock[]> {
    const [profile] = await m.query<{ id: string }[]>(
      `SELECT id FROM professional_profiles WHERE user_id = $1`,
      [userId],
    );
    const profileId = profile?.id ?? null;
    const [{ jobs }] = await m.query<{ jobs: number }[]>(
      `SELECT count(*)::int AS jobs FROM (
         SELECT id FROM service_requests
          WHERE status::text = ANY($3) AND (client_id = $1 OR selected_professional_id = $2)
         UNION
         SELECT request_id FROM jobs
          WHERE status::text = ANY($4) AND (client_id = $1 OR professional_id = $2)
       ) t`,
      [userId, profileId, [...ACTIVE_REQUEST_STATUSES], [...ACTIVE_JOB_STATUSES]],
    );
    const [{ subs }] = await m.query<{ subs: number }[]>(
      `SELECT count(*)::int AS subs FROM billing_subscriptions
        WHERE professional_id = $1 AND status IN ('PENDING', 'ACTIVE', 'PAST_DUE', 'PAUSED')`,
      [profileId],
    );
    return deletionBlockers({ activeJobs: jobs, openSubscriptions: subs });
  }

  /** Solicitudes sin profesional elegido: se cancelan; y en todas se borra lo privado (dirección, fotos, texto). */
  private async cancelOpenRequests(m: EntityManager, userId: string): Promise<number> {
    const cancelled = await m.query<{ id: string }[]>(
      `UPDATE service_requests
          SET status = 'CANCELLED', cancelled_at = now(), updated_at = now()
        WHERE client_id = $1 AND status::text = ANY($2)
        RETURNING id`,
      [userId, [...AUTO_CANCELLED_REQUEST_STATUSES]],
    );
    if (cancelled.length) {
      // Los avisos pendientes a profesionales sobre esas solicitudes ya no piden nada.
      await m.query(
        `UPDATE notifications SET read_at = now()
          WHERE request_id = ANY($1) AND read_at IS NULL AND user_id <> $2`,
        [cancelled.map((r) => r.id), userId],
      );
    }
    await m.query(`DELETE FROM request_photos WHERE request_id IN (SELECT id FROM service_requests WHERE client_id = $1)`, [
      userId,
    ]);
    await m.query(
      `UPDATE service_requests SET exact_address = NULL, description = $2, updated_at = now() WHERE client_id = $1`,
      [userId, DELETED_REQUEST_DESCRIPTION],
    );
    return cancelled.length;
  }

  /** Perfil profesional: sale de la búsqueda, se retiran presupuestos pendientes y se borran fotos, matrícula y documentos. */
  private async closeProfessional(m: EntityManager, profileId: string): Promise<void> {
    await m.query(`UPDATE quotes SET status = 'WITHDRAWN', updated_at = now() WHERE professional_id = $1 AND status = 'PENDING'`, [
      profileId,
    ]);
    await m.query(`UPDATE request_invitations SET status = 'DECLINED' WHERE professional_id = $1 AND status = 'PENDING'`, [
      profileId,
    ]);

    await this.destroyProfessionalFiles(m, profileId);

    await m.query(`DELETE FROM professional_work_photos WHERE professional_id = $1`, [profileId]);
    await m.query(
      `UPDATE professional_verifications
          SET document_public_id = NULL, document_deleted_at = coalesce(document_deleted_at, now()),
              reference = NULL, updated_at = now()
        WHERE professional_id = $1`,
      [profileId],
    );
    await m.query(
      `UPDATE professional_profiles
          SET headline = NULL, bio = NULL, status = 'PAUSED', available_today = false, available_on = NULL,
              avatar_public_id = NULL, avatar_url = NULL, slug = $2,
              pro_interest_at = NULL, pro_interest_offer_code = NULL, updated_at = now()
        WHERE id = $1`,
      [profileId, deletedSlug(profileId)],
    );
  }

  /** Foto de perfil, trabajos realizados y documentos de matrícula en Cloudinary (las filas las borra quien llama). */
  private async destroyProfessionalFiles(m: EntityManager, profileId: string): Promise<void> {
    const [{ avatar_public_id: avatarId }] = await m.query<{ avatar_public_id: string | null }[]>(
      `SELECT avatar_public_id FROM professional_profiles WHERE id = $1`,
      [profileId],
    );
    const workPhotos = await m.query<{ public_id: string }[]>(
      `SELECT public_id FROM professional_work_photos WHERE professional_id = $1`,
      [profileId],
    );
    const docs = await m.query<{ document_public_id: string }[]>(
      `SELECT document_public_id FROM professional_verifications
        WHERE professional_id = $1 AND document_public_id IS NOT NULL AND document_deleted_at IS NULL`,
      [profileId],
    );
    // Archivos primero y dentro de la transacción: si Cloudinary falla se revierte todo y se puede reintentar.
    await this.destroyAll(this.photos, [avatarId, ...workPhotos.map((p) => p.public_id)]);
    await this.destroyAll(this.documents, docs.map((d) => d.document_public_id));
  }

  private async destroyAll(
    storage: Pick<AvatarStorage, 'configured' | 'destroy'>,
    publicIds: (string | null | undefined)[],
  ): Promise<void> {
    if (!storage.configured) return;
    for (const id of publicIds) {
      if (!id) continue;
      try {
        await storage.destroy(id);
      } catch (error) {
        this.logger.warn(`no se pudo borrar un archivo de la cuenta: ${(error as Error).message}`);
        throw new AppException(
          ErrorCode.ACCOUNT_DELETE_FAILED,
          'No pudimos eliminar tus archivos. Intentá nuevamente en unos minutos.',
          HttpStatus.BAD_GATEWAY,
        );
      }
    }
  }

  private async anonymizeUser(m: EntityManager, user: UserRow): Promise<void> {
    const id = user.id;
    await m.query(
      `UPDATE users
          SET first_name = $2, last_name = $3, email = $4, password_hash = $5, phone = NULL, phone_verified = false,
              email_verified_at = NULL, avatar_url = NULL, is_admin = false, default_zone_id = NULL,
              deleted_at = now(), updated_at = now()
        WHERE id = $1`,
      // Hash inválido a propósito: argon2.verify falla y nadie vuelve a entrar con esta cuenta.
      [id, DELETED_FIRST_NAME, DELETED_LAST_NAME, deletedEmail(id), `deleted:${randomUUID()}`],
    );
    await m.query(`DELETE FROM refresh_tokens WHERE user_id = $1`, [id]);
    await m.query(`DELETE FROM email_verification_codes WHERE user_id = $1`, [id]);
    await m.query(`DELETE FROM notifications WHERE user_id = $1`, [id]);
    await m.query(`DELETE FROM professional_favorites WHERE client_id = $1`, [id]);
    await m.query(`DELETE FROM pending_registrations WHERE lower(email) = lower($1)`, [user.email]);
  }
}
