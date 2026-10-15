import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { AppException } from '../common/errors/app-exception';
import { ErrorCode } from '../common/errors/error-codes';
import { contactProblem } from '../common/text/contact-in-text';
import { ApproveServiceDto, SuggestionQueryDto } from './dto/service-suggestion.dto';

const key = (name: string) => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const invalid = (message: string): never => { throw AppException.unprocessable(ErrorCode.VALIDATION_ERROR, message); };
const checkText = (value: string) => {
  if (contactProblem(value) || /https?:\/\/|www\.|[<>\u0000-\u001f\u007f]/i.test(value)) // eslint-disable-line no-control-regex
    invalid('Usá texto simple, sin teléfonos, emails ni enlaces.');
};

/** Sugerir nunca publica ni modifica el perfil; solo un admin cambia el catálogo. */
@Injectable()
export class ServiceSuggestionsService {
  constructor(private readonly ds: DataSource) {}

  private async list(m: EntityManager, where: string, params: unknown[], pagination = '') {
    return m.query(`SELECT r.id, r.name, r.status, r.reason, r.created_at AS "createdAt",
      r.reviewed_at AS "reviewedAt", s.id AS "serviceId", s.name AS "serviceName",
      (s.active AND c.active) IS TRUE AS "serviceActive"
      FROM service_suggestions r LEFT JOIN services s ON s.id = r.service_id
      LEFT JOIN categories c ON c.id = s.category_id WHERE ${where} ${pagination}`, params);
  }

  mine(userId: string) {
    return this.list(this.ds.manager, 'r.user_id = $1', [userId], "ORDER BY (r.status = 'PENDING') DESC, r.created_at DESC, r.id DESC LIMIT 30");
  }

  async suggest(userId: string, name: string) {
    checkText(name);
    const normalized = key(name);
    if (!normalized) invalid('Escribí el nombre del oficio.');
    return this.ds.transaction(async (m) => {
      // Serializa el cupo y los reintentos de la misma cuenta, incluso antes de crear su perfil.
      await m.query(`SELECT id FROM users WHERE id = $1 FOR UPDATE`, [userId]);
      const [existing] = await this.list(m, `r.user_id = $1 AND r.name_key = $2 AND r.status = 'PENDING'`, [userId, normalized]);
      if (existing) return existing;
      const [{ pending, recent }] = await m.query<{ pending: number; recent: number }[]>(`SELECT
        count(*) FILTER (WHERE status = 'PENDING')::int AS pending,
        count(*) FILTER (WHERE created_at >= now() - interval '30 days')::int AS recent
        FROM service_suggestions WHERE user_id = $1`, [userId]);
      if (pending >= 5 || recent >= 10)
        throw AppException.conflict(ErrorCode.CONFLICT, 'Podés tener hasta 5 oficios pendientes y enviar hasta 10 sugerencias cada 30 días.');
      const [row] = await m.query<{ id: string }[]>(`INSERT INTO service_suggestions(user_id, name, name_key) VALUES ($1,$2,$3) RETURNING id`, [userId, name, normalized]);
      return (await this.list(m, 'r.id = $1', [row.id]))[0];
    });
  }

  async adminList(query: SuggestionQueryDto) {
    const status = query.status ?? 'PENDING';
    const page = query.page ?? 1;
    const [{ total }] = await this.ds.query<{ total: number }[]>(`SELECT count(*)::int AS total FROM service_suggestions WHERE status = $1`, [status]);
    const items = await this.list(this.ds.manager, 'r.status = $1', [status, (page - 1) * 25], 'ORDER BY r.created_at, r.id LIMIT 25 OFFSET $2');
    return { items, total, page, pageSize: 25 };
  }

  async approve(id: string, adminId: string, dto: ApproveServiceDto) {
    if (dto.serviceId && (dto.name !== undefined || dto.categoryId !== undefined || dto.requiresLicense !== undefined))
      invalid('Elegí vincular un oficio existente o crear uno nuevo.');
    if (!dto.serviceId && (!dto.name || !dto.categoryId || dto.requiresLicense === undefined))
      invalid('Indicá el nombre, la categoría y si permite verificar matrícula.');
    if (dto.name) checkText(dto.name);
    return this.ds.transaction(async (m) => {
      await this.pending(m, id);
      let serviceId = dto.serviceId;
      if (serviceId) {
        const [service] = await m.query(`SELECT s.id FROM services s JOIN categories c ON c.id = s.category_id WHERE s.id = $1 AND s.active AND c.active FOR SHARE OF s, c`, [serviceId]);
        if (!service) invalid('Elegí un oficio activo del catálogo.');
      } else {
        // Dos admins no pueden crear dos veces el mismo nombre/slug.
        await m.query(`SELECT pg_advisory_xact_lock(1795500000)`);
        const slug = key(dto.name!);
        if (!slug) invalid('El nombre del oficio debe contener letras o números.');
        const services = await m.query<{ name: string; slug: string }[]>(`SELECT name, slug FROM services`);
        if (services.some((s) => s.slug === slug || key(s.name) === slug))
          throw AppException.conflict(ErrorCode.CONFLICT, 'Ese oficio ya existe. Vinculá la sugerencia con el oficio del catálogo.');
        const [category] = await m.query(`SELECT id FROM categories WHERE id = $1 AND active FOR SHARE`, [dto.categoryId]);
        if (!category) invalid('Elegí una categoría activa.');
        const [service] = await m.query<{ id: string }[]>(`INSERT INTO services(category_id, name, slug, requires_license, sort_order, active)
          VALUES ($1,$2,$3,$4,(SELECT coalesce(max(sort_order),0)+1 FROM services WHERE category_id = $1),true) RETURNING id`,
        [dto.categoryId, dto.name, slug, dto.requiresLicense]);
        serviceId = service.id;
      }
      await m.query(`UPDATE service_suggestions SET status = 'APPROVED', service_id = $2, reviewed_by = $3, reviewed_at = now() WHERE id = $1`, [id, serviceId, adminId]);
      return (await this.list(m, 'r.id = $1', [id]))[0];
    });
  }

  async reject(id: string, adminId: string, reason: string) {
    checkText(reason);
    return this.ds.transaction(async (m) => {
      await this.pending(m, id);
      await m.query(`UPDATE service_suggestions SET status = 'REJECTED', reason = $2, reviewed_by = $3, reviewed_at = now() WHERE id = $1`, [id, reason, adminId]);
      return (await this.list(m, 'r.id = $1', [id]))[0];
    });
  }

  private async pending(m: EntityManager, id: string) {
    const [row] = await m.query<{ status: string }[]>(`SELECT status FROM service_suggestions WHERE id = $1 FOR UPDATE`, [id]);
    if (!row) throw AppException.notFound('Sugerencia');
    if (row.status !== 'PENDING') throw AppException.conflict(ErrorCode.CONFLICT, 'Esta sugerencia ya fue revisada. Actualizá la lista.');
  }
}
