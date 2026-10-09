import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AccountService } from '../account/account.service';
import { BillingService } from '../billing/billing.service';
import { BillingSubscriptionStatus, OPEN_SUBSCRIPTION_STATUSES } from '../billing/billing.enums';
import { AppException } from '../common/errors/app-exception';
import { ErrorCode } from '../common/errors/error-codes';
import { EFFECTIVE_PRO_SQL, planSource } from '../plans/plan';
import { ProfessionalProfile } from '../professionals/professional-profile.entity';
import { PlanTier } from '../professionals/professional.enums';
import type { AdminUserKind } from './admin.dto';

const DAY_MS = 86_400_000;

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

/** Plan del profesional en el detalle: de dónde sale el PRO y la suscripción de Mercado Pago. */
export interface AdminUserPlan {
  tier: PlanTier;
  /** MANUAL (panel o plan:set) | BILLING (Mercado Pago) | BONUS (referidos) | null = Free. */
  source: 'MANUAL' | 'BILLING' | 'TRANSFER' | 'BONUS' | null;
  /** PRO manual vigente: hasta cuándo (null = sin vencimiento o no tiene). */
  manualUntil: string | null;
  manualActive: boolean;
  billingProUntil: string | null;
  /** PRO pagado por transferencia (confirmado en Pagos) vigente hasta. */
  transferProUntil: string | null;
  bonusProUntil: string | null;
  /** La suscripción viva, o la última cancelada. */
  subscription: {
    status: BillingSubscriptionStatus;
    currentAmount: number;
    currency: string;
    nextPaymentAt: string | null;
    accessUntil: string | null;
    cancelledAt: string | null;
  } | null;
  /** false = BILLING_PROVIDER=none: no hay suscripciones que cancelar. */
  billingEnabled: boolean;
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
  private readonly logger = new Logger('AdminUsers');

  constructor(
    private readonly dataSource: DataSource,
    private readonly account: AccountService,
    private readonly billing: BillingService,
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
    const [activity, deletion, plan] = await Promise.all([
      this.activity(id, user.professional?.id ?? null),
      this.account.check(id),
      user.professional ? this.plan(user.professional.id) : null,
    ]);
    return { user: { ...user, ...details }, activity, blockers: deletion.blockers, plan };
  }

  /**
   * Da PRO MANUAL de cortesía (lo mismo que `plan:set --plan PRO --courtesy`):
   * `days` desde hoy, o sin vencimiento. No cuenta como PRO pago, así que no le
   * quita la oferta de bienvenida. Con una suscripción paga viva no se da: se
   * le seguiría cobrando por un PRO que ya tiene (cancelarla antes).
   */
  async grantPro(id: string, adminId: string, days?: number) {
    const profileId = await this.professionalOf(id);
    await this.dataSource.transaction(async (m) => {
      await m.findOne(ProfessionalProfile, { where: { id: profileId }, lock: { mode: 'pessimistic_write' } });
      const [{ paying }] = await m.query<{ paying: number }[]>(
        `SELECT count(*)::int AS paying FROM billing_subscriptions
          WHERE professional_id = $1 AND status IN ('ACTIVE', 'PAST_DUE')`,
        [profileId],
      );
      if (paying > 0) {
        throw AppException.conflict(
          ErrorCode.ADMIN_PLAN_BLOCKED,
          'Paga PRO con una suscripción de Mercado Pago: cancelala primero para no seguir cobrándole.',
        );
      }
      await m.update(ProfessionalProfile, profileId, {
        planTier: PlanTier.PRO,
        planExpiresAt: days ? new Date(Date.now() + days * DAY_MS) : null,
      });
    });
    this.logger.log(`admin ${adminId} dio PRO manual a ${id} ${days ? `por ${days} días` : 'sin vencimiento'}`);
    return this.show(id);
  }

  /** Quita el PRO manual. No toca una suscripción paga ni el bonus de referidos. */
  async revokePro(id: string, adminId: string) {
    const profileId = await this.professionalOf(id, true);
    await this.dataSource
      .getRepository(ProfessionalProfile)
      .update(profileId, { planTier: PlanTier.FREE, planExpiresAt: null });
    this.logger.log(`admin ${adminId} quitó el PRO manual a ${id}`);
    return this.show(id);
  }

  /**
   * Cancela la renovación de su suscripción de Mercado Pago: la MISMA regla que
   * "Cancelar" en Mi plan (reconcilia, PRO hasta el fin del período pago). No reembolsa.
   */
  async cancelSubscription(id: string, adminId: string) {
    const profileId = await this.professionalOf(id, true);
    const profile = await this.dataSource.getRepository(ProfessionalProfile).findOneByOrFail({ id: profileId });
    await this.billing.cancel(profile);
    this.logger.log(`admin ${adminId} canceló la suscripción PRO de ${id}`);
    return this.show(id);
  }

  /** El perfil profesional de la cuenta. Salvo `allowDeleted`, la cuenta no puede estar dada de baja. */
  private async professionalOf(id: string, allowDeleted = false): Promise<string> {
    const [row] = await this.dataSource.query<{ deleted_at: Date | null; profile_id: string | null }[]>(
      `SELECT u.deleted_at, p.id AS profile_id FROM users u
         LEFT JOIN professional_profiles p ON p.user_id = u.id WHERE u.id = $1`,
      [id],
    );
    if (!row) throw AppException.notFound('Usuario');
    if (!row.profile_id) throw AppException.notFound('Perfil profesional');
    if (row.deleted_at && !allowDeleted) {
      throw AppException.conflict(ErrorCode.ADMIN_PLAN_BLOCKED, 'La cuenta está dada de baja.');
    }
    return row.profile_id;
  }

  private async plan(profileId: string): Promise<AdminUserPlan> {
    const p = await this.dataSource.getRepository(ProfessionalProfile).findOneByOrFail({ id: profileId });
    const [sub] = await this.dataSource.query<NonNullable<AdminUserPlan['subscription']>[]>(
      `SELECT status, current_amount AS "currentAmount", currency, next_payment_at AS "nextPaymentAt",
              access_until AS "accessUntil", cancelled_at AS "cancelledAt"
         FROM billing_subscriptions
        WHERE professional_id = $1 AND (status::text = ANY($2) OR authorized_at IS NOT NULL)
        ORDER BY (status::text = ANY($2)) DESC, created_at DESC LIMIT 1`,
      [profileId, [...OPEN_SUBSCRIPTION_STATUSES]],
    );
    const source = planSource(p);
    const now = new Date();
    const manualActive = p.planTier === PlanTier.PRO && (!p.planExpiresAt || p.planExpiresAt > now);
    return {
      tier: source ? PlanTier.PRO : PlanTier.FREE,
      source,
      manualActive,
      manualUntil: manualActive ? (p.planExpiresAt?.toISOString() ?? null) : null,
      billingProUntil: p.billingProUntil && p.billingProUntil > now ? p.billingProUntil.toISOString() : null,
      transferProUntil: p.transferProUntil && p.transferProUntil > now ? p.transferProUntil.toISOString() : null,
      bonusProUntil: p.bonusProUntil && p.bonusProUntil > now ? p.bonusProUntil.toISOString() : null,
      subscription: sub
        ? {
            ...sub,
            nextPaymentAt: sub.status === BillingSubscriptionStatus.CANCELLED ? null : sub.nextPaymentAt,
          }
        : null,
      billingEnabled: this.billing.enabled,
    };
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
