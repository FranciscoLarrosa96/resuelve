import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager, In } from 'typeorm';
import { AppException } from '../common/errors/app-exception';
import { ErrorCode } from '../common/errors/error-codes';
import { FunnelEventType } from '../funnel/funnel-event.entity';
import { recordFunnelEvent } from '../funnel/funnel';
import { ProfessionalProfile } from '../professionals/professional-profile.entity';
import { presentPublicProfessional } from '../professionals/professional.presenter';
import { isPublicProfile } from '../professionals/professional-rules';
import { ProfessionalFavorite } from './professional-favorite.entity';
import { RetentionAvailability, rehireServiceId, retentionAvailability } from './retention-rules';

/** Tope de cada lista de "Mis profesionales" (los más recientes). */
const LIST_LIMIT = 100;
/** Trabajos anteriores que se muestran por profesional. */
const HISTORY_LIMIT = 5;

const PROFILE_RELATIONS = {
  user: true,
  services: { service: true },
  serviceAreas: { zone: true },
  localities: { city: { provinceRef: true } },
  primaryCity: { provinceRef: true },
  verifications: true,
} as const;

interface HiredRow {
  professional_id: string;
  jobs_count: number;
  last_completed_at: Date;
}
interface HistoryRow {
  professional_id: string;
  request_id: string;
  title: string;
  service_id: string;
  service_name: string;
  completed_at: Date;
}

export interface PastJob {
  requestId: string;
  title: string;
  serviceName: string;
  completedAt: Date;
}

/** Lo que el cliente tiene con un profesional: favoritos y trabajos realizados (siempre de Jobs reales). */
@Injectable()
export class RetentionService {
  constructor(private readonly dataSource: DataSource) {}

  // ---- Favoritos ---------------------------------------------------------

  /**
   * Guarda un profesional (idempotente: guardar dos veces es lo mismo que una).
   * Solo perfiles públicos; el propio perfil no se guarda.
   */
  async save(clientId: string, professionalId: string) {
    return this.dataSource.transaction(async (m) => {
      const profile = await m.findOneBy(ProfessionalProfile, { id: professionalId });
      if (!profile || !isPublicProfile(profile)) throw AppException.notFound('Profesional');
      if (profile.userId === clientId) {
        throw AppException.unprocessable(ErrorCode.VALIDATION_ERROR, 'No podés guardar tu propio perfil');
      }
      const inserted: { id: string }[] = await m.query(
        `INSERT INTO professional_favorites (client_id, professional_id) VALUES ($1, $2)
         ON CONFLICT (client_id, professional_id) DO NOTHING RETURNING id`,
        [clientId, professionalId],
      );
      if (inserted.length) {
        await recordFunnelEvent(m, {
          type: FunnelEventType.PROFESSIONAL_SAVED,
          professionalId,
          ref: clientId,
        });
      }
      return { saved: true };
    });
  }

  /** Quita de guardados. Idempotente y siempre posible (aunque el perfil esté pausado). No toca el historial. */
  async unsave(clientId: string, professionalId: string) {
    return this.dataSource.transaction(async (m) => {
      // El driver devuelve [filas, cantidad] en un DELETE … RETURNING.
      const [deleted] = await m.query<[{ id: string }[], number]>(
        `DELETE FROM professional_favorites WHERE client_id = $1 AND professional_id = $2 RETURNING id`,
        [clientId, professionalId],
      );
      if (deleted.length) {
        await recordFunnelEvent(m, {
          type: FunnelEventType.PROFESSIONAL_UNSAVED,
          professionalId,
          ref: clientId,
        });
      }
      return { saved: false };
    });
  }

  // ---- Mis profesionales ---------------------------------------------------

  /** "Contratados anteriormente" (al menos un Job COMPLETED del cliente) y "Guardados". */
  async mine(clientId: string) {
    const m = this.dataSource.manager;
    const hiredRows = await m.query<HiredRow[]>(
      `SELECT j.professional_id, count(*)::int AS jobs_count,
              max(COALESCE(j.completed_at, j.updated_at)) AS last_completed_at
         FROM jobs j
        WHERE j.client_id = $1 AND j.status = 'COMPLETED'
        GROUP BY j.professional_id
        ORDER BY last_completed_at DESC, j.professional_id
        LIMIT ${LIST_LIMIT}`,
      [clientId],
    );
    const savedRows = await m.query<{ professional_id: string; saved_at: Date }[]>(
      `SELECT professional_id, created_at AS saved_at
         FROM professional_favorites
        WHERE client_id = $1
        ORDER BY created_at DESC, id DESC
        LIMIT ${LIST_LIMIT}`,
      [clientId],
    );
    const ids = [...new Set([...hiredRows, ...savedRows].map((r) => r.professional_id))];
    const [profiles, history, hiredCounts] = await Promise.all([
      this.loadProfiles(m, ids),
      this.history(m, clientId, hiredRows.map((r) => r.professional_id)),
      this.hiredCounts(m, clientId, savedRows.map((r) => r.professional_id)),
    ]);

    const hired = hiredRows.flatMap((row) => {
      const profile = profiles.get(row.professional_id);
      if (!profile) return [];
      const jobs = history.get(row.professional_id) ?? [];
      return [
        {
          ...this.card(profile),
          jobsCount: row.jobs_count,
          lastCompletedAt: row.last_completed_at,
          rehireServiceId: rehireServiceId(
            jobs[0]?.serviceId ?? null,
            profile.services.map((s) => s.id),
          ),
          jobs: jobs.slice(0, HISTORY_LIMIT).map(({ serviceId: _s, ...job }) => job),
          saved: savedRows.some((s) => s.professional_id === row.professional_id),
        },
      ];
    });
    const saved = savedRows.flatMap((row) => {
      const profile = profiles.get(row.professional_id);
      if (!profile) return [];
      return [
        {
          ...this.card(profile),
          savedAt: row.saved_at,
          jobsCount: hiredCounts.get(row.professional_id) ?? 0,
        },
      ];
    });
    return { hired, saved };
  }

  /**
   * Lo que el cliente tiene con UN profesional (perfil público): si lo guardó,
   * sus trabajos anteriores y si puede volver a contratarlo. 404 si el perfil no
   * existe, o no es público y no hay ninguna relación (no revela perfiles pausados ajenos).
   */
  async relationship(clientId: string, professionalId: string) {
    const m = this.dataSource.manager;
    const [favorite, history] = await Promise.all([
      m.findOneBy(ProfessionalFavorite, { clientId, professionalId }),
      this.history(m, clientId, [professionalId]),
    ]);
    const jobs = history.get(professionalId) ?? [];
    const profile = (await this.loadProfiles(m, [professionalId])).get(professionalId);
    if (!profile || (!favorite && !jobs.length && !profile.acceptingRequests)) {
      throw AppException.notFound('Profesional');
    }
    const [{ count }] = await m.query<{ count: number }[]>(
      `SELECT count(*)::int AS count FROM jobs WHERE client_id = $1 AND professional_id = $2 AND status = 'COMPLETED'`,
      [clientId, professionalId],
    );
    return {
      professionalId,
      saved: !!favorite,
      savedAt: favorite?.createdAt ?? null,
      availability: profile.availability,
      jobsCount: count,
      lastCompletedAt: jobs[0]?.completedAt ?? null,
      // Volver a contratar solo existe con un trabajo realizado y un profesional que hoy recibe solicitudes.
      canRehire: count > 0 && profile.availability === 'AVAILABLE',
      rehireServiceId: rehireServiceId(
        jobs[0]?.serviceId ?? null,
        profile.services.map((s) => s.id),
      ),
      jobs: jobs.slice(0, HISTORY_LIMIT).map(({ serviceId: _s, ...job }) => job),
    };
  }

  // ---- helpers -----------------------------------------------------------

  private card(profile: LoadedProfile) {
    const { availability, ...professional } = profile;
    return { professional, availability, canRequest: availability === 'AVAILABLE' };
  }

  private async loadProfiles(m: EntityManager, ids: string[]): Promise<Map<string, LoadedProfile>> {
    if (!ids.length) return new Map();
    const profiles = await m.find(ProfessionalProfile, { where: { id: In(ids) }, relations: PROFILE_RELATIONS });
    return new Map(
      profiles.map((p) => {
        const presented = presentPublicProfessional(p);
        return [p.id, { ...presented, availability: retentionAvailability(p, presented.services.length) }];
      }),
    );
  }

  /** Trabajos realizados con cada profesional, el más reciente primero (hasta HISTORY_LIMIT por profesional). */
  private async history(
    m: EntityManager,
    clientId: string,
    professionalIds: string[],
  ): Promise<Map<string, (PastJob & { serviceId: string })[]>> {
    const result = new Map<string, (PastJob & { serviceId: string })[]>();
    if (!professionalIds.length) return result;
    const rows = await m.query<HistoryRow[]>(
      `SELECT * FROM (
         SELECT j.professional_id, r.id AS request_id, r.title, s.id AS service_id, s.name AS service_name,
                COALESCE(j.completed_at, j.updated_at) AS completed_at,
                row_number() OVER (PARTITION BY j.professional_id
                                   ORDER BY COALESCE(j.completed_at, j.updated_at) DESC, j.id) AS position
           FROM jobs j
           JOIN service_requests r ON r.id = j.request_id
           JOIN services s ON s.id = r.service_id
          WHERE j.client_id = $1 AND j.status = 'COMPLETED' AND j.professional_id = ANY($2::uuid[])
       ) t WHERE t.position <= ${HISTORY_LIMIT}
       ORDER BY t.professional_id, t.position`,
      [clientId, professionalIds],
    );
    for (const row of rows) {
      const list = result.get(row.professional_id) ?? [];
      list.push({
        requestId: row.request_id,
        title: row.title,
        serviceId: row.service_id,
        serviceName: row.service_name,
        completedAt: row.completed_at,
      });
      result.set(row.professional_id, list);
    }
    return result;
  }

  private async hiredCounts(m: EntityManager, clientId: string, professionalIds: string[]) {
    if (!professionalIds.length) return new Map<string, number>();
    const rows = await m.query<{ professional_id: string; count: number }[]>(
      `SELECT professional_id, count(*)::int AS count FROM jobs
        WHERE client_id = $1 AND status = 'COMPLETED' AND professional_id = ANY($2::uuid[])
        GROUP BY professional_id`,
      [clientId, professionalIds],
    );
    return new Map(rows.map((r) => [r.professional_id, r.count]));
  }
}

type LoadedProfile = ReturnType<typeof presentPublicProfessional> & { availability: RetentionAvailability };

/** ¿Es una recontratación? El cliente ya tuvo un trabajo realizado con ese profesional. */
export async function isRehire(
  m: Pick<EntityManager, 'query'>,
  clientId: string,
  professionalId: string,
): Promise<boolean> {
  const rows = await m.query(
    `SELECT 1 FROM jobs WHERE client_id = $1 AND professional_id = $2 AND status = 'COMPLETED' LIMIT 1`,
    [clientId, professionalId],
  );
  return rows.length > 0;
}
