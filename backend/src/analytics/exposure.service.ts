import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { AuthUser } from '../common/auth/auth-user';
import { ExposureEventsDto } from './dto/exposure-events.dto';
import { ExposureEvent, ExposureEventType } from './exposure-event.entity';
import { ExposureContext, exposureDedupeKey, sha256 } from './exposure';

/**
 * Registra apariciones en búsquedas y visitas al perfil. Nunca guarda quién
 * vio (ni usuario, ni IP): solo el hash de una clave de sesión aleatoria. Se
 * descartan en silencio: profesionales inexistentes, la propia exposición
 * (el profesional viéndose a sí mismo) y duplicados (`dedupe_key` único).
 */
@Injectable()
export class ExposureService {
  constructor(private readonly dataSource: DataSource) {}

  async record(dto: ExposureEventsDto, user?: AuthUser): Promise<{ accepted: number }> {
    const now = new Date();
    const sessionKeyHash = sha256(`resuelve-session|${dto.sessionKey}`);
    const proIds = [...new Set(dto.events.map((e) => e.professionalId))];
    const catalogIds = [
      ...new Set(dto.events.flatMap((e) => [e.serviceId, e.zoneId]).filter((id): id is string => !!id)),
    ];

    const [pros, known] = await Promise.all([
      this.dataSource.query<{ id: string; user_id: string }[]>(
        `SELECT id, user_id FROM professional_profiles WHERE id = ANY($1::uuid[])`,
        [proIds],
      ),
      catalogIds.length
        ? this.dataSource.query<{ id: string }[]>(
            `SELECT id FROM services WHERE id = ANY($1::uuid[]) UNION SELECT id FROM zones WHERE id = ANY($1::uuid[])`,
            [catalogIds],
          )
        : [],
    ]);
    const countable = new Set(pros.filter((p) => p.user_id !== user?.userId).map((p) => p.id));
    const knownCatalog = new Set(known.map((r) => r.id));
    const orNull = (id?: string) => (id && knownCatalog.has(id) ? id : null);

    const rows = new Map<string, Partial<ExposureEvent>>();
    for (const e of dto.events) {
      if (!countable.has(e.professionalId)) continue;
      const search = e.type === ExposureEventType.SEARCH_IMPRESSION;
      const ctx: ExposureContext = {
        type: e.type,
        professionalId: e.professionalId,
        serviceId: search ? orNull(e.serviceId) : null,
        zoneId: search ? orNull(e.zoneId) : null,
        isUrgent: search ? (e.isUrgent ?? null) : null,
        page: search ? (e.page ?? 1) : null,
      };
      const dedupeKey = exposureDedupeKey(ctx, sessionKeyHash, now);
      rows.set(dedupeKey, {
        ...ctx,
        isFeaturedPlacement: search && !!e.isFeaturedPlacement,
        sessionKeyHash,
        dedupeKey,
      });
    }
    if (!rows.size) return { accepted: 0 };

    const result = await this.dataSource
      .createQueryBuilder()
      .insert()
      .into(ExposureEvent)
      .values([...rows.values()])
      .orIgnore()
      .returning('id')
      .execute();
    return { accepted: (result.raw as unknown[]).length };
  }
}
