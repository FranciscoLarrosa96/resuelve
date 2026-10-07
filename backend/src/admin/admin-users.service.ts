import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AccountService } from '../account/account.service';
import { AppException } from '../common/errors/app-exception';
import { ErrorCode } from '../common/errors/error-codes';
import { EFFECTIVE_PRO_SQL } from '../plans/plan';
import type { AdminUserKind } from './admin.dto';

export const ADMIN_USERS_PAGE_SIZE = 25;

/** Una fila del listado (`GET /admin/users`). */
export interface AdminUserItem {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  createdAt: string;
  deletedAt: string | null;
  isAdmin: boolean;
  professional: { id: string; slug: string; status: 'ACTIVE' | 'PAUSED'; pro: boolean } | null;
}

/** Cuánto cuelga de la cuenta: lo que se borra con ella en un borrado definitivo. */
export interface AdminUserActivity {
  requests: number;
  quotes: number;
  jobs: number;
  reviewsWritten: number;
  reviewsReceived: number;
  /** Otras cuentas con las que tuvo solicitudes, presupuestos, invitaciones o reseñas. */
  counterparts: number;
  /** Suscripciones PRO vivas (PENDING/ACTIVE/PAST_DUE/PAUSED). */
  openSubscriptions: number;
}

const KIND_SQL: Record<AdminUserKind, string> = {
  active: 'u.deleted_at IS NULL',
  professionals: 'u.deleted_at IS NULL AND p.id IS NOT NULL',
  clients: 'u.deleted_at IS NULL AND p.id IS NULL',
  admins: 'u.deleted_at IS NULL AND u.is_admin',
  deleted: 'u.deleted_at IS NOT NULL',
};

const ITEM_SELECT = `
  SELECT u.id, u.first_name AS "firstName", u.last_name AS "lastName", u.email,
         u.created_at AS "createdAt", u.deleted_at AS "deletedAt", u.is_admin AS "isAdmin",
         CASE WHEN p.id IS NULL THEN NULL ELSE json_build_object(
           'id', p.id, 'slug', p.slug, 'status', p.status, 'pro', COALESCE(${EFFECTIVE_PRO_SQL}, false)
         ) END AS professional
    FROM users u
    LEFT JOIN professional_profiles p ON p.user_id = u.id`;

/** `%`, `_` y `\` literales dentro de un ILIKE. */
const likeEscape = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * Gestión de usuarios del panel admin. Leer es libre para el admin; dar de baja
 * y borrar delegan en `AccountService` (única regla de baja). Nunca se toca la
 * propia cuenta ni la de otro admin: el rol se quita antes con `npm run admin:grant -- <email> --revoke`.
 */
@Injectable()
export class AdminUsersService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly account: AccountService,
  ) {}

  async list(params: { q?: string; kind?: AdminUserKind; page?: number }) {
    const page = params.page ?? 1;
    const where = [KIND_SQL[params.kind ?? 'active']];
    const args: unknown[] = [];
    const q = params.q?.trim();
    if (q) {
      args.push(`%${likeEscape(q)}%`);
      where.push(`(u.email ILIKE $1 OR (u.first_name || ' ' || u.last_name) ILIKE $1)`);
    }
    const filter = `WHERE ${where.join(' AND ')}`;
    const [items, [{ total }]] = await Promise.all([
      this.dataSource.query<AdminUserItem[]>(
        `${ITEM_SELECT} ${filter} ORDER BY u.created_at DESC, u.id
          LIMIT ${ADMIN_USERS_PAGE_SIZE} OFFSET ${(page - 1) * ADMIN_USERS_PAGE_SIZE}`,
        args,
      ),
      this.dataSource.query<{ total: number }[]>(
        `SELECT count(*)::int AS total FROM users u LEFT JOIN professional_profiles p ON p.user_id = u.id ${filter}`,
        args,
      ),
    ]);
    return { items, total, page, pageSize: ADMIN_USERS_PAGE_SIZE };
  }

  async show(id: string) {
    const [user] = await this.dataSource.query<AdminUserItem[]>(`${ITEM_SELECT} WHERE u.id = $1`, [id]);
    if (!user) throw AppException.notFound('Usuario');
    const [details] = await this.dataSource.query<
      { phone: string | null; emailVerifiedAt: string | null; termsAcceptedAt: string | null }[]
    >(
      `SELECT phone, email_verified_at AS "emailVerifiedAt", terms_accepted_at AS "termsAcceptedAt" FROM users WHERE id = $1`,
      [id],
    );
    const [activity, deletion] = await Promise.all([
      this.activity(id, user.professional?.id ?? null),
      this.account.check(id),
    ]);
    return { user: { ...user, ...details }, activity, blockers: deletion.blockers };
  }

  async deactivate(id: string, adminId: string) {
    await this.assertManageable(id, adminId);
    await this.account.deleteAsAdmin(id);
    return this.show(id);
  }

  async purge(id: string, adminId: string, confirmEmail: string) {
    const email = await this.assertManageable(id, adminId);
    if (confirmEmail.trim().toLowerCase() !== email.toLowerCase()) {
      throw AppException.unprocessable(
        ErrorCode.ADMIN_CONFIRM_MISMATCH,
        'El email escrito no coincide con el de la cuenta.',
      );
    }
    return this.account.purge(id);
  }

  /** Devuelve el email actual. */
  private async assertManageable(id: string, adminId: string): Promise<string> {
    const [user] = await this.dataSource.query<{ email: string; is_admin: boolean }[]>(
      `SELECT email, is_admin FROM users WHERE id = $1`,
      [id],
    );
    if (!user) throw AppException.notFound('Usuario');
    if (id === adminId || user.is_admin) {
      throw AppException.conflict(
        ErrorCode.ADMIN_USER_PROTECTED,
        id === adminId
          ? 'No podés dar de baja ni borrar tu propia cuenta desde el panel.'
          : 'Es una cuenta admin: quitale el acceso al panel antes (npm run admin:grant -- <email> --revoke).',
      );
    }
    return user.email;
  }

  private async activity(userId: string, profileId: string | null): Promise<AdminUserActivity> {
    const [row] = await this.dataSource.query<AdminUserActivity[]>(
      `SELECT
         (SELECT count(*)::int FROM service_requests WHERE client_id = $1) AS requests,
         (SELECT count(*)::int FROM quotes WHERE professional_id = $2) AS quotes,
         (SELECT count(*)::int FROM jobs WHERE client_id = $1 OR professional_id = $2) AS jobs,
         (SELECT count(*)::int FROM reviews WHERE client_id = $1) AS "reviewsWritten",
         (SELECT count(*)::int FROM reviews WHERE professional_id = $2) AS "reviewsReceived",
         (SELECT count(*)::int FROM billing_subscriptions
           WHERE professional_id = $2 AND status IN ('PENDING', 'ACTIVE', 'PAST_DUE', 'PAUSED')) AS "openSubscriptions",
         (SELECT count(DISTINCT other)::int FROM (
            SELECT pp.user_id AS other FROM quotes q
              JOIN service_requests r ON r.id = q.request_id
              JOIN professional_profiles pp ON pp.id = q.professional_id
             WHERE r.client_id = $1
            UNION
            SELECT pp.user_id FROM request_invitations i
              JOIN service_requests r ON r.id = i.request_id
              JOIN professional_profiles pp ON pp.id = i.professional_id
             WHERE r.client_id = $1
            UNION
            SELECT r.client_id FROM quotes q JOIN service_requests r ON r.id = q.request_id WHERE q.professional_id = $2
            UNION
            SELECT r.client_id FROM request_invitations i JOIN service_requests r ON r.id = i.request_id
             WHERE i.professional_id = $2
            UNION
            SELECT client_id FROM reviews WHERE professional_id = $2 AND client_id IS NOT NULL
          ) t WHERE other <> $1) AS counterparts`,
      [userId, profileId],
    );
    return row;
  }
}
