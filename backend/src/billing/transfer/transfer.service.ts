import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, EntityManager, In, IsNull, LessThan, Not } from 'typeorm';
import { AppException } from '../../common/errors/app-exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { FunnelEventType } from '../../funnel/funnel-event.entity';
import { recordFunnelEvent } from '../../funnel/funnel';
import { NotificationType, type WithdrawalResolvedNotice } from '../../notifications/notification.entity';
import { WithdrawalContactRequest, WithdrawalContactStatus } from './withdrawal-contact-request.entity';
import { notify } from '../../notifications/notify';
import { effectivePlan } from '../../plans/plan';
import { isScheduledUpgrade, planChangeFlags } from '../../plans/plan-change';
import { offerEventDedupeKey } from '../../plans/pro-offers';
import { ProOfferEvent, ProOfferEventType } from '../../plans/pro-offer-event.entity';
import { ProOfferRedemption } from '../../plans/pro-offer-redemption.entity';
import { ProfessionalProfile } from '../../professionals/professional-profile.entity';
import { PlanTier } from '../../professionals/professional.enums';
import {
  ALLOWED_DOCUMENT_FORMATS,
  DOCUMENT_STORAGE,
  DocumentStorage,
  MAX_DOCUMENT_BYTES,
} from '../../verifications/document-storage';
import { BillingService } from '../billing.service';
import { billingWithdrawalDays } from '../billing-rules';
import {
  OPEN_TRANSFER_STATUSES,
  TransferPayment,
  TransferPaymentOrigin,
  TransferPaymentStatus,
} from './transfer-payment.entity';
import {
  DAY_MS,
  DAYS_PER_MONTH,
  EXPIRY_REMINDER_DAYS,
  PROOF_RETENTION_DAYS,
  TRANSFER_PERIODS,
  isTransferPeriod,
  newTransferReference,
  transferAmount,
  transferPeriodEnd,
  transferPeriodStart,
  transferOutcomeVisible,
  retimeAfterRevocation,
  computeWithdrawalUntil,
  transferWithdrawableUntil,
  withdrawalPeriodState,
} from './transfer-rules';

/** Carpeta privada de comprobantes por profesional: solo su id interno. */
export const transferProofFolder = (professionalId: string): string => `resuelve/transfer-proofs/${professionalId}`;
/** Lo que dura el link firmado para ver un comprobante en el panel admin. */
const PROOF_URL_TTL_SECONDS = 10 * 60;

export interface TransferAccount {
  holder: string;
  alias: string;
  cbu: string | null;
  bank: string | null;
  cuit: string | null;
}

interface TransferAccountRow extends TransferAccount {
  enabled: boolean;
  changed_by: string;
  created_at: Date;
}

/** Por qué no puede pagar por transferencia ahora (además de que la opción esté apagada). */
export type TransferBlock = 'SUBSCRIPTION_ACTIVE' | 'MANUAL_PRO';

export interface TransferQuote {
  months: number;
  days: number;
  amountArs: number;
  basePriceArs: number;
  /** Primer mes con la oferta de bienvenida (null = precio normal). */
  discountedFirstMonthArs: number | null;
  offerCode: string | null;
  /**
   * Fecha PREVISTA de inicio del período: al terminar el PRO (o cualquier acceso ya pagado) vigente;
   * si no hay, ahora. Si la confirmación llega después, el período arranca en la confirmación:
   * nunca se descuentan días anteriores.
   */
  startsAt: Date;
  endsAt: Date;
  /** El período empieza al confirmar (no hay nada pago vigente que respetar). */
  startsNow: boolean;
}

/**
 * PRO por transferencia: el profesional elige el período, transfiere con el
 * código en el concepto y avisa (con comprobante opcional); un admin lo
 * confirma o lo rechaza. Montos y fechas se deciden SIEMPRE acá.
 */
@Injectable()
export class TransferService {
  private readonly logger = new Logger('Transfer');

  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly billing: BillingService,
    @Inject(DOCUMENT_STORAGE) private readonly storage: DocumentStorage,
  ) {}

  // ---- Profesional ----------------------------------------------------------

  /** Todo lo que ve Mi plan → "Pagar por transferencia". */
  async overview(professionalId: string) {
    const m = this.dataSource.manager;
    const p = await m.findOneByOrFail(ProfessionalProfile, { id: professionalId });
    const account = await this.currentAccount(m);
    const block = await this.block(m, p);
    const repo = m.getRepository(TransferPayment);
    const pending = await repo.findOne({ where: { professionalId, status: In([...OPEN_TRANSFER_STATUSES]) } });
    const last = pending
      ? null
      : await repo.findOne({
          where: { professionalId, status: Not(In([TransferPaymentStatus.CANCELLED, ...OPEN_TRANSFER_STATUSES])) },
          order: { updatedAt: 'DESC' },
        });
    const now = new Date();
    const withdrawables = await this.withdrawablePayments(m, professionalId);
    // `withdrawal` (el botón simple) = el primero que todavía se puede iniciar; una solicitud ya registrada
    // se consulta en `withdrawals`, aunque la ventana haya vencido después.
    const withdrawable = withdrawables.find((w) => w.canRequest) ?? null;
    const days = billingWithdrawalDays(this.config);
    const refund = await repo.findOne({
      where: { professionalId, status: TransferPaymentStatus.WITHDRAWN, refundedAt: IsNull() },
      order: { withdrawnAt: 'DESC' },
    });
    const available = !!account?.enabled;
    return {
      /** false = el admin no cargó (o apagó) los datos bancarios: la opción no se muestra. */
      available,
      account: available && account ? publicAccount(account) : null,
      blocked: block,
      options: available && !block && !pending ? await this.quotes(m, p) : [],
      plusOptions:
        available && !block && !pending && this.tierAllowed(p, PlanTier.PRO_PLUS, now)
          ? await this.quotes(m, p, PlanTier.PRO_PLUS)
          : [],
      /** Plan que rige por transferencia hoy o el último comprado (null = no hay acceso pago por transferencia). */
      currentTier: this.currentTier(p, now),
      /** PRO Plus ya confirmado que todavía no empezó: cuándo empieza (null = ninguno). */
      plusStartsAt: p.transferPlusFrom && p.transferPlusFrom > now ? p.transferPlusFrom : null,
      /** Plus puede comprarse con inicio al terminar el PRO pagado (apagado por defecto). */
      scheduledPlus: planChangeFlags(this.config).transfer,
      pending: pending ? { ...present(pending), ...this.plannedPeriod(p, pending.months, now) } : null,
      /** Último pago cerrado (para mostrar un rechazo con su motivo, o el confirmado). */
      last: last ? present(last) : null,
      /** El último pago confirmado o rechazado, solo durante `TRANSFER_OUTCOME_VISIBLE_DAYS` desde la revisión. */
      recentOutcome: last && transferOutcomeVisible(last, now) ? present(last) : null,
      /** PRO por transferencia vigente hasta (null = no tiene). */
      proUntil: p.transferProUntil && p.transferProUntil > now ? p.transferProUntil : null,
      /** Arrepentimiento: el último pago confirmado (por fin de período), mientras corre su ventana legal. */
      withdrawal: withdrawable ? this.presentWithdrawal(withdrawable.payment, days, now) : null,
      /**
       * Todos los pagos con la ventana abierta. `deferred` = hay pagos posteriores que dependen de sus
       * fechas: la solicitud se registra (con su fecha) y la resuelve el equipo; `requestedAt` = ya pedida.
       */
      withdrawals: withdrawables.map((w) => ({
        ...this.presentWithdrawal(w.payment, days, now),
        deferred: w.hasLater,
        requestedAt: w.payment.withdrawalRequestedAt,
        canRequest: w.canRequest,
      })),
      /** Se arrepintió y falta que le devuelvan la plata (`reference` = código de arrepentimiento). */
      refundPending: refund
        ? { amountArs: refund.amountArs, withdrawnAt: refund.withdrawnAt, reference: refund.reference, planTier: refund.planTier }
        : null,
      /** Se puede adjuntar el comprobante (almacenamiento privado configurado). */
      proofUploads: this.storage.configured,
    };
  }

  /**
   * Elige el período: crea el pedido con su código y monto. Si había otro
   * sin comprobante lo reemplaza; si ya avisó que transfirió, no (lo está
   * revisando un admin).
   */
  async request(professionalId: string, months: number, tier: PlanTier = PlanTier.PRO) {
    if (!isTransferPeriod(months)) {
      throw AppException.unprocessable(ErrorCode.VALIDATION_ERROR, 'Elegí 1, 3 o 6 meses', { allowed: TRANSFER_PERIODS });
    }
    await this.dataSource.transaction(async (m) => {
      const p = await this.lockProfile(m, professionalId);
      const account = await this.currentAccount(m);
      if (!account?.enabled) throw notAvailable();
      const block = await this.block(m, p);
      if (block) throw blocked(block);
      if (!this.tierAllowed(p, tier, new Date())) {
        throw AppException.conflict(ErrorCode.TRANSFER_BLOCKED, 'Podés cambiar de plan cuando termine tu período ya pagado.');
      }
      const open = await m.findOne(TransferPayment, {
        where: { professionalId, status: In([...OPEN_TRANSFER_STATUSES]) },
        lock: { mode: 'pessimistic_write' },
      });
      if (open?.status === TransferPaymentStatus.IN_REVIEW) throw inReview();
      const quote = (await this.quotes(m, p, tier)).find((q) => q.months === months)!;
      if (open) {
        // Mismo período y mismo monto: el mismo código (la persona puede haber transferido ya).
        if (open.planTier === tier && open.months === months && open.amountArs === quote.amountArs) return;
        await m.update(TransferPayment, open.id, { status: TransferPaymentStatus.CANCELLED });
        await this.dropProof(open);
      }
      await this.insertWithReference(m, {
        professionalId,
        status: TransferPaymentStatus.AWAITING_PROOF,
        origin: TransferPaymentOrigin.PROFESSIONAL,
        planTier: tier,
        months,
        amountArs: quote.amountArs,
        basePriceArs: quote.basePriceArs,
        offerCode: quote.offerCode,
      });
    });
    return this.overview(professionalId);
  }

  /** Descarta el pedido antes de avisar que transfirió. */
  async cancel(professionalId: string) {
    await this.dataSource.transaction(async (m) => {
      const open = await m.findOne(TransferPayment, {
        where: { professionalId, status: In([...OPEN_TRANSFER_STATUSES]) },
        lock: { mode: 'pessimistic_write' },
      });
      if (!open) throw noPending();
      if (open.status === TransferPaymentStatus.IN_REVIEW) throw inReview();
      await m.update(TransferPayment, open.id, { status: TransferPaymentStatus.CANCELLED });
      await this.dropProof(open);
    });
    return this.overview(professionalId);
  }

  /** Firma temporal para subir el comprobante directo al almacenamiento privado. */
  async uploadTicket(professionalId: string) {
    this.assertStorage();
    const open = await this.dataSource
      .getRepository(TransferPayment)
      .findOne({ where: { professionalId, status: In([...OPEN_TRANSFER_STATUSES]) } });
    if (!open) throw noPending();
    return this.storage.createUploadTicket(transferProofFolder(professionalId));
  }

  /**
   * "Ya transferí": pasa a revisión, con el comprobante si lo subió (opcional:
   * el código del concepto alcanza para encontrar el pago). Vale también para
   * reemplazar el comprobante mientras está en revisión.
   */
  async submit(professionalId: string, proofPublicId?: string) {
    const stored = proofPublicId ? await this.checkProof(professionalId, proofPublicId) : null;
    let replaced: TransferPayment | null = null;
    await this.dataSource.transaction(async (m) => {
      const open = await m.findOne(TransferPayment, {
        where: { professionalId, status: In([...OPEN_TRANSFER_STATUSES]) },
        lock: { mode: 'pessimistic_write' },
      });
      if (!open) throw noPending();
      if (stored && open.proofPublicId && open.proofPublicId !== stored.publicId) replaced = open;
      await m.update(TransferPayment, open.id, {
        status: TransferPaymentStatus.IN_REVIEW,
        ...(stored
          ? { proofPublicId: stored.publicId, proofFormat: stored.format, proofUploadedAt: new Date() }
          : {}),
      });
    });
    if (replaced) await this.dropProof(replaced);
    this.logger.log(`transfer submitted professional=${professionalId} proof=${stored ? 'yes' : 'no'}`);
    return this.overview(professionalId);
  }

  /**
   * Botón de arrepentimiento sobre el pago elegido (sin `paymentId`, el último). La ventana se mide
   * contra el momento de la SOLICITUD, no de la resolución.
   *  - Si ningún pago posterior depende de sus fechas: se revoca en el acto (sin descontar uso) y queda
   *    pendiente la devolución total, a mano, a la cuenta indicada. Un período que todavía no empezó
   *    (Plus programado) no toca el acceso de hoy; uno que ya empezó se quita en el acto.
   *  - Si hay pagos posteriores: se REGISTRA la solicitud (fecha, destino) y el pago sigue vigente; el
   *    acceso no cambia y no se devuelve nada hasta que un admin la resuelva (`resolveWithdrawal`).
   *    Nunca se anula otro pago por su cuenta.
   */
  async withdraw(professionalId: string, refundTo: string, paymentId?: string) {
    const days = billingWithdrawalDays(this.config);
    await this.dataSource.transaction(async (m) => {
      await this.lockProfile(m, professionalId);
      const options = await this.withdrawablePayments(m, professionalId, true);
      const requested = paymentId ? options.find((o) => o.payment.id === paymentId && o.payment.withdrawalRequestedAt) : null;
      if (requested) {
        throw AppException.conflict(
          ErrorCode.TRANSFER_WITHDRAWAL_PENDING,
          'Ya recibimos tu solicitud de arrepentimiento para este pago: la estamos resolviendo.',
        );
      }
      const target = paymentId ? options.find((o) => o.payment.id === paymentId && o.canRequest) : options.find((o) => o.canRequest);
      if (!target) {
        throw AppException.conflict(
          ErrorCode.TRANSFER_WITHDRAWAL_EXPIRED,
          `Pasó el plazo de ${days} días desde que empezó el período de ese pago, o no hay un pago para revocar.`,
        );
      }
      const now = new Date();
      if (target.hasLater) {
        await m.update(TransferPayment, target.payment.id, {
          withdrawalRequestedAt: now,
          refundDestination: refundTo.trim(),
        });
        this.logger.log(`transfer withdrawal requested professional=${professionalId} payment=${target.payment.id}`);
        return;
      }
      await m.update(TransferPayment, target.payment.id, {
        status: TransferPaymentStatus.WITHDRAWN,
        withdrawnAt: now,
        refundDestination: refundTo.trim(),
      });
      await this.syncProfileAccess(m, professionalId);
      await recordFunnelEvent(m, { type: FunnelEventType.PRO_CANCELLED, professionalId, ref: target.payment.id });
      this.logger.log(`transfer withdrawn professional=${professionalId}`);
    });
    return this.overview(professionalId);
  }

  // ---- Admin ----------------------------------------------------------------

  async adminList(status?: TransferPaymentStatus) {
    const rows = await this.dataSource.query<AdminRow[]>(
      `${ADMIN_SELECT}
        WHERE ($1::text IS NULL OR t.status::text = $1)
        ORDER BY (t.status = 'IN_REVIEW') DESC, (t.status = 'APPROVED' AND t.withdrawal_requested_at IS NOT NULL) DESC, (t.status = 'WITHDRAWN' AND t.refunded_at IS NULL) DESC, t.updated_at DESC
        LIMIT 200`,
      [status ?? null],
    );
    const [counts] = await this.dataSource.query<{ in_review: number; awaiting: number; refunds: number; requests: number }[]>(
      `SELECT count(*) FILTER (WHERE status = 'IN_REVIEW')::int AS in_review,
              count(*) FILTER (WHERE status = 'AWAITING_PROOF')::int AS awaiting,
              count(*) FILTER (WHERE status = 'WITHDRAWN' AND refunded_at IS NULL)::int AS refunds,
              count(*) FILTER (WHERE status = 'APPROVED' AND withdrawal_requested_at IS NOT NULL)::int AS requests
         FROM transfer_payments`,
    );
    return {
      items: rows.map((r) => presentAdmin(r, billingWithdrawalDays(this.config))),
      counts: { inReview: counts.in_review, awaitingProof: counts.awaiting, refundsPending: counts.refunds, withdrawalRequests: counts.requests },
    };
  }

  /** Detalle con un link firmado (10 min) al comprobante, si hay. */
  async adminDetail(id: string) {
    const row = await this.adminRow(id);
    const proofUrl =
      row.proof_public_id && row.proof_format && !row.proof_deleted_at && this.storage.configured
        ? this.storage.signedDownloadUrl({ publicId: row.proof_public_id, format: row.proof_format }, PROOF_URL_TTL_SECONDS)
        : null;
    return { ...presentAdmin(row, billingWithdrawalDays(this.config)), proofUrl };
  }

  /** Confirma un pago recibido: PRO por los meses pagados, sin pisar días ya vigentes. */
  async approve(id: string, adminId: string, note?: string) {
    await this.dataSource.transaction(async (m) => {
      const payment = await m.findOne(TransferPayment, { where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!payment) throw AppException.notFound('Pago');
      if (!(OPEN_TRANSFER_STATUSES as readonly TransferPaymentStatus[]).includes(payment.status)) throw invalidState();
      await this.approveInTx(m, payment, adminId, note);
    });
    return this.adminDetail(id);
  }

  async reject(id: string, adminId: string, reason: string) {
    await this.dataSource.transaction(async (m) => {
      const payment = await m.findOne(TransferPayment, { where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!payment) throw AppException.notFound('Pago');
      if (!(OPEN_TRANSFER_STATUSES as readonly TransferPaymentStatus[]).includes(payment.status)) throw invalidState();
      await m.update(TransferPayment, id, {
        status: TransferPaymentStatus.REJECTED,
        reviewedByUserId: adminId,
        reviewedAt: new Date(),
        rejectionReason: reason.trim().slice(0, 300),
      });
      const [owner] = await m.query<{ user_id: string }[]>(`SELECT user_id FROM professional_profiles WHERE id = $1`, [
        payment.professionalId,
      ]);
      await notify(m, { userId: owner.user_id, type: NotificationType.PRO_TRANSFER_REJECTED, dedupeRef: id }, adminId);
    });
    this.logger.log(`admin ${adminId} rechazó la transferencia ${id}`);
    return this.adminDetail(id);
  }

  /**
   * Resuelve una solicitud de arrepentimiento que quedó registrada (había pagos posteriores). El pago
   * pasa a WITHDRAWN con la fecha de la SOLICITUD (`withdrawn_at = withdrawal_requested_at`: el plazo no
   * se gasta mientras se resuelve) y queda pendiente la devolución total. Los pagos posteriores NO se
   * anulan: se adelantan para empezar cuando corresponde sin el período revocado (`retimeAfterRevocation`),
   * con su misma duración, así que nadie recibe días que no pagó. Un pago posterior que YA empezó (o
   * terminó) no se toca: sus períodos consumidos no se reinician ni se duplican. Al profesional se le
   * avisa (in-app) el código y las fechas nuevas de los que se movieron.
   */
  async resolveWithdrawal(id: string, adminId: string) {
    await this.dataSource.transaction(async (m) => {
      const found = await m.findOne(TransferPayment, { where: { id } });
      if (!found) throw AppException.notFound('Pago');
      const p = await this.lockProfile(m, found.professionalId);
      const payment = await m.findOneOrFail(TransferPayment, { where: { id }, lock: { mode: 'pessimistic_write' } });
      if (payment.status !== TransferPaymentStatus.APPROVED || !payment.withdrawalRequestedAt) throw invalidState();
      const now = new Date();
      await m.update(TransferPayment, payment.id, {
        status: TransferPaymentStatus.WITHDRAWN,
        withdrawnAt: payment.withdrawalRequestedAt,
      });
      const others = await m.find(TransferPayment, {
        where: { professionalId: p.id, status: TransferPaymentStatus.APPROVED },
      });
      const x = payment.periodStart!;
      const later = others.filter((o) => o.periodStart && o.periodStart.getTime() >= x.getTime());
      const earlierEnds = others
        .filter((o) => !later.includes(o) && o.periodEnd)
        .map((o) => o.periodEnd!.getTime());
      await m.update(WithdrawalContactRequest, { linkedPaymentId: payment.id, status: WithdrawalContactStatus.LINKED }, { status: WithdrawalContactStatus.RESOLVED });
      const manualPro = p.planTier !== PlanTier.FREE && !!p.planExpiresAt && p.planExpiresAt > now;
      const retimed = retimeAfterRevocation(
        later.map((o) => ({ id: o.id, months: o.months, periodStart: o.periodStart! })),
        { ...p, transferProUntil: earlierEnds.length ? new Date(Math.max(...earlierEnds)) : null, manualPro },
        now,
      );
      const changes: WithdrawalResolvedNotice['changes'] = [];
      for (const r of retimed) {
        const before = later.find((o) => o.id === r.id)!;
        if (before.periodStart!.getTime() === r.periodStart.getTime()) continue;
        // Adelantar un período no acorta la ventana ya informada: rige el mayor entre ella y los días desde el nuevo inicio.
        await m.update(TransferPayment, r.id, {
          periodStart: r.periodStart,
          periodEnd: r.periodEnd,
          withdrawalUntil: computeWithdrawalUntil(
            { reviewedAt: before.reviewedAt, periodStart: r.periodStart },
            billingWithdrawalDays(this.config),
            transferWithdrawableUntil(before, billingWithdrawalDays(this.config)),
          ),
        });
        changes.push({
          reference: before.reference,
          tier: before.planTier === PlanTier.PRO_PLUS ? 'PRO_PLUS' : 'PRO',
          startsAt: r.periodStart.toISOString(),
          endsAt: r.periodEnd.toISOString(),
        });
      }
      const [owner] = await m.query<{ user_id: string }[]>(`SELECT user_id FROM professional_profiles WHERE id = $1`, [p.id]);
      await notify(
        m,
        {
          userId: owner.user_id,
          type: NotificationType.PRO_TRANSFER_WITHDRAWAL_RESOLVED,
          dedupeRef: payment.id,
          payload: { withdrawalResolved: { reference: payment.reference, changes } },
        },
        adminId,
      );
      await this.syncProfileAccess(m, p.id);
      await recordFunnelEvent(m, { type: FunnelEventType.PRO_CANCELLED, professionalId: p.id, ref: payment.id });
    });
    this.logger.log(`admin ${adminId} resolvió el arrepentimiento del pago ${id}`);
    return this.adminDetail(id);
  }

  /** La devolución de un arrepentimiento ya se hizo (a mano, a `refundDestination`). */
  async markRefunded(id: string, adminId: string) {
    const result = await this.dataSource
      .createQueryBuilder()
      .update(TransferPayment)
      .set({ refundedAt: () => 'now()' })
      .where('id = :id AND status = :status AND refunded_at IS NULL', { id, status: TransferPaymentStatus.WITHDRAWN })
      .execute();
    if (!result.affected) {
      await this.adminRow(id); // 404 si no existe
      throw invalidState();
    }
    this.logger.log(`admin ${adminId} marcó devuelta la transferencia ${id}`);
    return this.adminDetail(id);
  }

  /**
   * Anota un pago recibido por fuera del flujo (sin pedido del profesional):
   * queda confirmado en el acto, con el monto que realmente llegó.
   */
  async record(userId: string, adminId: string, months: number, amountArs: number, note?: string, tier: PlanTier = PlanTier.PRO) {
    if (!isTransferPeriod(months)) {
      throw AppException.unprocessable(ErrorCode.VALIDATION_ERROR, 'Elegí 1, 3 o 6 meses', { allowed: TRANSFER_PERIODS });
    }
    const [row] = await this.dataSource.query<{ deleted_at: Date | null; profile_id: string | null }[]>(
      `SELECT u.deleted_at, p.id AS profile_id FROM users u
         LEFT JOIN professional_profiles p ON p.user_id = u.id WHERE u.id = $1`,
      [userId],
    );
    if (!row) throw AppException.notFound('Usuario');
    if (!row.profile_id) throw AppException.notFound('Perfil profesional');
    if (row.deleted_at) throw AppException.conflict(ErrorCode.ADMIN_PLAN_BLOCKED, 'La cuenta está dada de baja.');
    const professionalId = row.profile_id;
    await this.dataSource.transaction(async (m) => {
      const p = await this.lockProfile(m, professionalId);
      if ((await this.block(m, p)) === 'SUBSCRIPTION_ACTIVE') throw blocked('SUBSCRIPTION_ACTIVE');
      if (!this.tierAllowed(p, tier, new Date())) {
        throw AppException.conflict(ErrorCode.TRANSFER_BLOCKED, 'El nuevo plan se puede contratar cuando termine el período ya pagado.');
      }
      const open = await m.findOne(TransferPayment, {
        where: { professionalId, status: In([...OPEN_TRANSFER_STATUSES]) },
      });
      if (open) {
        throw AppException.conflict(
          ErrorCode.TRANSFER_IN_REVIEW,
          `Tiene un pedido abierto (${open.reference}): confirmalo desde Pagos en lugar de anotar otro.`,
        );
      }
      const base = (await this.quotes(m, p, tier)).find((q) => q.months === 1)!.basePriceArs;
      const payment = await this.insertWithReference(m, {
        professionalId,
        status: TransferPaymentStatus.IN_REVIEW,
        origin: TransferPaymentOrigin.ADMIN,
        planTier: tier,
        months,
        amountArs,
        basePriceArs: base,
        offerCode: null,
      });
      await this.approveInTx(m, payment, adminId, note);
    });
    this.logger.log(`admin ${adminId} anotó una transferencia de ${months} mes(es) para ${userId}`);
  }

  async account() {
    const row = await this.currentAccount(this.dataSource.manager);
    return row
      ? { enabled: row.enabled, ...publicAccount(row), changedBy: row.changed_by, updatedAt: row.created_at }
      : null;
  }

  async setAccount(input: TransferAccount & { enabled: boolean }, changedBy: string) {
    await this.dataSource.query(
      `INSERT INTO transfer_accounts (enabled, holder, alias, cbu, bank, cuit, changed_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        input.enabled,
        input.holder.trim(),
        input.alias.trim(),
        input.cbu?.trim() || null,
        input.bank?.trim() || null,
        input.cuit?.trim() || null,
        changedBy.slice(0, 80),
      ],
    );
    return this.account();
  }

  // ---- Job (cada hora) ------------------------------------------------------

  /**
   * - "Tu PRO vence pronto": una vez por fin de período, `EXPIRY_REMINDER_DAYS`
   *   antes, si no hay otro PRO pagado que siga después.
   * - Borra el archivo de los comprobantes revisados hace más de
   *   `PROOF_RETENTION_DAYS` (el registro del pago queda).
   */
  async tick(now = new Date()): Promise<{ reminded: number; purged: number; activated: number }> {
    const due = await this.dataSource.query<{ id: string; user_id: string; until: Date }[]>(
      `SELECT p.id, p.user_id, p.transfer_pro_until AS until FROM professional_profiles p
        WHERE p.transfer_pro_until > $1 AND p.transfer_pro_until <= $2
          AND (p.billing_pro_until IS NULL OR p.billing_pro_until <= p.transfer_pro_until)
          AND (p.bonus_pro_until IS NULL OR p.bonus_pro_until <= p.transfer_pro_until)`,
      [now, new Date(now.getTime() + EXPIRY_REMINDER_DAYS * DAY_MS)],
    );
    for (const p of due) {
      await this.dataSource.transaction((m) =>
        notify(
          m,
          {
            userId: p.user_id,
            type: NotificationType.PRO_TRANSFER_EXPIRING,
            dedupeRef: `${p.id}:${new Date(p.until).toISOString()}`,
          },
          null,
        ),
      );
    }
    // Plus programado que ya rige: un aviso por pago (dedupe), solo al primer período Plus de una cadena
    // (una renovación de Plus contigua no es un cambio de plan) y solo si se confirmó ANTES de empezar.
    const started = await this.dataSource.query<{ id: string; user_id: string; period_start: Date }[]>(
      `SELECT t.id, p.user_id, t.period_start FROM transfer_payments t
         JOIN professional_profiles p ON p.id = t.professional_id
        WHERE t.status = 'APPROVED' AND t.plan_tier = 'PRO_PLUS'
          AND t.period_start <= $1 AND t.period_end > $1 AND t.reviewed_at < t.period_start
          AND NOT EXISTS (
            SELECT 1 FROM transfer_payments t2
             WHERE t2.professional_id = t.professional_id AND t2.status = 'APPROVED' AND t2.plan_tier = 'PRO_PLUS'
               AND t2.id <> t.id AND t2.period_start < t.period_start AND t2.period_end >= t.period_start)`,
      [now],
    );
    for (const t of started) {
      await this.dataSource.transaction((m) =>
        notify(
          m,
          {
            userId: t.user_id,
            type: NotificationType.PRO_PLAN_CHANGE_ACTIVATED,
            dedupeRef: t.id,
            payload: { planChange: { tier: 'PRO_PLUS', via: 'TRANSFER', startsAt: new Date(t.period_start).toISOString() } },
          },
          null,
        ),
      );
    }
    const old = await this.dataSource.getRepository(TransferPayment).find({
      where: {
        proofPublicId: Not(IsNull()),
        proofDeletedAt: IsNull(),
        status: Not(In([...OPEN_TRANSFER_STATUSES])),
        updatedAt: LessThan(new Date(now.getTime() - PROOF_RETENTION_DAYS * DAY_MS)),
      },
      take: 100,
    });
    let purged = 0;
    for (const t of old) {
      if (this.storage.configured) {
        try {
          await this.storage.destroy(t.proofPublicId!);
        } catch (error) {
          this.logger.warn(`transfer no se pudo borrar un comprobante: ${(error as Error).message}`);
          continue;
        }
      }
      await this.dataSource.getRepository(TransferPayment).update(t.id, { proofDeletedAt: now });
      purged++;
    }
    return { reminded: due.length, purged, activated: started.length };
  }

  // ---------------------------------------------------------------------------

  /** Períodos con su monto: precio vigente × meses; la oferta de bienvenida solo en el primer mes. */
  private async quotes(m: EntityManager, p: ProfessionalProfile, tier: PlanTier = PlanTier.PRO): Promise<TransferQuote[]> {
    const price = await this.billing.checkoutPrice(m, p, tier);
    const discounted = price.offerCode ? price.amount : null;
    return TRANSFER_PERIODS.map((months) => ({
      months,
      days: months * DAYS_PER_MONTH,
      amountArs: transferAmount(price.baseAmount, months, discounted),
      basePriceArs: price.baseAmount,
      discountedFirstMonthArs: discounted,
      offerCode: price.offerCode,
      ...this.plannedPeriod(p, months, new Date()),
    }));
  }

  /** Inicio y fin PREVISTOS de un período nuevo (los mismos que usará la confirmación si no demora). */
  private plannedPeriod(p: ProfessionalProfile, months: number, now: Date) {
    const manualPro = p.planTier !== PlanTier.FREE && !!p.planExpiresAt && p.planExpiresAt > now;
    const startsAt = transferPeriodStart({ ...p, manualPro }, now);
    return { startsAt, endsAt: transferPeriodEnd(startsAt, months), startsNow: startsAt.getTime() <= now.getTime() };
  }

  /** Plan del último acceso pagado por transferencia vigente o programado (null = ninguno). */
  private currentTier(p: ProfessionalProfile, now: Date): PlanTier | null {
    if (!p.transferProUntil || p.transferProUntil <= now) return null;
    return p.transferPlusUntil && p.transferPlusUntil > now ? PlanTier.PRO_PLUS : PlanTier.PRO;
  }

  /**
   * ¿Se puede pedir `tier` ahora? El mismo plan siempre. Pasar de PRO a Plus solo con el cambio
   * programado habilitado; Plus → PRO queda fuera (se contrata cuando termina el período pago).
   */
  private tierAllowed(p: ProfessionalProfile, tier: PlanTier, now: Date): boolean {
    const current = this.currentTier(p, now);
    if (!current || current === tier) return true;
    return planChangeFlags(this.config).transfer && isScheduledUpgrade(current, tier);
  }

  /**
   * Con una suscripción de Mercado Pago viva pagaría dos veces; con PRO manual
   * sin vencimiento no hay nada que pagar. Un PRO que vence (bonus, cortesía,
   * transferencia, MP cancelada) no bloquea: el período nuevo arranca después.
   */
  private async block(m: EntityManager, p: ProfessionalProfile): Promise<TransferBlock | null> {
    if (p.planTier !== PlanTier.FREE && !p.planExpiresAt) return 'MANUAL_PRO';
    const [{ paying }] = await m.query<{ paying: number }[]>(
      `SELECT count(*)::int AS paying FROM billing_subscriptions
        WHERE professional_id = $1 AND status IN ('ACTIVE', 'PAST_DUE')`,
      [p.id],
    );
    return paying > 0 ? 'SUBSCRIPTION_ACTIVE' : null;
  }

  private async approveInTx(m: EntityManager, payment: TransferPayment, adminId: string, note?: string) {
    const p = await this.lockProfile(m, payment.professionalId);
    const now = new Date();
    const planBefore = effectivePlan(p, now);
    const manualPro = p.planTier !== PlanTier.FREE && !!p.planExpiresAt && p.planExpiresAt > now;
    const start = transferPeriodStart({ ...p, manualPro }, now);
    const end = transferPeriodEnd(start, payment.months);
    await m.update(TransferPayment, payment.id, {
      status: TransferPaymentStatus.APPROVED,
      reviewedByUserId: adminId,
      reviewedAt: now,
      adminNote: note?.trim().slice(0, 300) || null,
      periodStart: start,
      periodEnd: end,
      withdrawalUntil: computeWithdrawalUntil({ reviewedAt: now, periodStart: start }, billingWithdrawalDays(this.config)),
    });
    await this.syncProfileAccess(m, p.id);
    // Ya pagó PRO: no vuelve a tener oferta de bienvenida.
    await m.query(
      `UPDATE professional_profiles SET first_paid_pro_at = coalesce(first_paid_pro_at, $2) WHERE id = $1`,
      [p.id, now],
    );
    if (payment.offerCode) await this.redeemOffer(m, payment, now);
    await recordFunnelEvent(m, {
      type: FunnelEventType.PRO_PAYMENT_APPROVED,
      professionalId: p.id,
      ref: payment.id,
      at: now,
      context: { billingPlan: payment.planTier },
    });
    const [{ previous }] = await m.query<{ previous: number }[]>(
      `SELECT (SELECT count(*) FROM transfer_payments WHERE professional_id = $1 AND status = 'APPROVED' AND id <> $2)
            + (SELECT count(*) FROM billing_payments bp JOIN billing_subscriptions bs ON bs.id = bp.billing_subscription_id
                WHERE bs.professional_id = $1 AND bp.status = 'APPROVED') AS previous`,
      [p.id, payment.id],
    );
    if (Number(previous) > 0) {
      await recordFunnelEvent(m, { type: FunnelEventType.PRO_RENEWED, professionalId: p.id, ref: payment.id, at: now });
    }
    // Plus que arranca más adelante (al terminar el PRO pagado): es un cambio programado, y su aviso
    // es solo in-app. "Ya tenés PRO" (que además sale por email y push) sería engañoso: todavía no rige.
    const scheduledChange =
      payment.planTier === PlanTier.PRO_PLUS && planBefore !== PlanTier.PRO_PLUS && start.getTime() > now.getTime();
    if (scheduledChange) {
      await notify(
        m,
        {
          userId: p.userId,
          type: NotificationType.PRO_PLAN_CHANGE_SCHEDULED,
          dedupeRef: payment.id,
          payload: { planChange: { tier: 'PRO_PLUS', via: 'TRANSFER', startsAt: start.toISOString() } },
        },
        adminId,
      );
    } else {
      await notify(m, { userId: p.userId, type: NotificationType.PRO_TRANSFER_APPROVED, dedupeRef: payment.id }, adminId);
    }
    this.logger.log(`transfer approved ${payment.id} months=${payment.months}${scheduledChange ? ' scheduled-plus' : ''}`);
  }

  /** `transfer_pro_until` = fin del último período confirmado y no revocado (null = ninguno). */
  private async syncProfileAccess(m: EntityManager, professionalId: string): Promise<void> {
    await m.query(
      `UPDATE professional_profiles SET transfer_plus_from = (
         SELECT min(period_start) FROM transfer_payments WHERE professional_id = $1 AND status = 'APPROVED' AND plan_tier = 'PRO_PLUS' AND period_end > now()
       ), transfer_plus_until = (
         SELECT max(period_end) FROM transfer_payments WHERE professional_id = $1 AND status = 'APPROVED' AND plan_tier = 'PRO_PLUS' AND period_end > now()
       ) WHERE id = $1`, [professionalId],
    );
    await m.query(
      `UPDATE professional_profiles SET transfer_pro_until = (
         SELECT max(period_end) FROM transfer_payments WHERE professional_id = $1 AND status = 'APPROVED'
       ) WHERE id = $1`,
      [professionalId],
    );
  }

  /** La oferta se consume con el pago confirmado (no al pedirlo). Unique profesional + código. */
  private async redeemOffer(m: EntityManager, t: TransferPayment, now: Date): Promise<void> {
    const discounted = t.amountArs - t.basePriceArs * (t.months - 1);
    await m
      .createQueryBuilder()
      .insert()
      .into(ProOfferRedemption)
      .values({
        professionalId: t.professionalId,
        offerCode: t.offerCode!,
        discountPercent: Math.max(0, Math.min(100, Math.round((1 - discounted / t.basePriceArs) * 100))),
        cycles: 1,
        basePriceArs: t.basePriceArs,
        discountedPriceArs: discounted,
      })
      .orIgnore()
      .execute();
    await m
      .createQueryBuilder()
      .insert()
      .into(ProOfferEvent)
      .values({
        type: ProOfferEventType.REDEEMED,
        surface: null,
        professionalId: t.professionalId,
        offerCode: t.offerCode!,
        dedupeKey: offerEventDedupeKey(ProOfferEventType.REDEEMED, t.professionalId, t.offerCode!, null, now),
      })
      .orIgnore()
      .execute();
  }

  /**
   * Pagos confirmados con algo para mostrar del arrepentimiento, el de fin de período más lejano primero:
   *  - `canRequest`: la ventana sigue abierta y todavía no hay solicitud (se puede INICIAR);
   *  - `payment.withdrawalRequestedAt`: ya hay una solicitud registrada; se consulta hasta resolverla
   *    aunque la ventana venza después (se pidió a tiempo: vencer no la borra).
   * `hasLater` = existe un pago confirmado posterior: revocarlo mueve las fechas de otros.
   */
  private async withdrawablePayments(m: EntityManager, professionalId: string, lock = false) {
    const days = billingWithdrawalDays(this.config);
    const approved = await m.find(TransferPayment, {
      where: { professionalId, status: TransferPaymentStatus.APPROVED },
      order: { periodEnd: 'DESC' },
      ...(lock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    const now = new Date();
    return approved
      .map((payment, index) => {
        const until = transferWithdrawableUntil(payment, days);
        const open = !!until && until >= now;
        return { payment, hasLater: index > 0, canRequest: open && !payment.withdrawalRequestedAt };
      })
      .filter(({ payment, canRequest }) => canRequest || !!payment.withdrawalRequestedAt);
  }

  private presentWithdrawal(t: TransferPayment, days: number, now: Date) {
    return {
      paymentId: t.id,
      reference: t.reference,
      planTier: t.planTier,
      months: t.months,
      amountArs: t.amountArs,
      until: transferWithdrawableUntil(t, days),
      startsAt: t.periodStart,
      endsAt: t.periodEnd,
      /** NOT_STARTED = revocar no cambia el acceso de hoy; STARTED = se quita en el acto. */
      periodState: withdrawalPeriodState(t.periodStart, now),
    };
  }

  private async insertWithReference(m: EntityManager, values: Partial<TransferPayment>): Promise<TransferPayment> {
    // El código es aleatorio y corto: ante un choque (rarísimo) se prueba otro.
    for (let attempt = 0; attempt < 5; attempt++) {
      const reference = newTransferReference();
      if (await m.existsBy(TransferPayment, { reference })) continue;
      const entity = m.create(TransferPayment, { ...values, reference });
      return m.save(entity);
    }
    throw new Error('No se pudo generar un código de transferencia único');
  }

  private async lockProfile(m: EntityManager, id: string): Promise<ProfessionalProfile> {
    return m.findOneOrFail(ProfessionalProfile, { where: { id }, lock: { mode: 'pessimistic_write' } });
  }

  private async currentAccount(m: Pick<EntityManager, 'query'>): Promise<TransferAccountRow | null> {
    const [row] = await m.query<TransferAccountRow[]>(
      `SELECT enabled, holder, alias, cbu, bank, cuit, changed_by, created_at FROM transfer_accounts ORDER BY id DESC LIMIT 1`,
    );
    return row ?? null;
  }

  /** El comprobante tiene que ser de SU carpeta; formato y peso se consultan al proveedor. */
  private async checkProof(professionalId: string, publicId: string) {
    this.assertStorage();
    if (!publicId.startsWith(`${transferProofFolder(professionalId)}/`)) throw AppException.notFound('Comprobante');
    if (await this.dataSource.getRepository(TransferPayment).existsBy({ proofPublicId: publicId })) {
      const open = await this.dataSource
        .getRepository(TransferPayment)
        .findOne({ where: { professionalId, status: In([...OPEN_TRANSFER_STATUSES]) } });
      if (open?.proofPublicId !== publicId) {
        throw AppException.conflict(ErrorCode.CONFLICT, 'Ese comprobante ya se usó en otro pago');
      }
    }
    const stored = await this.storage.inspect(publicId);
    if (!stored) throw AppException.notFound('Comprobante');
    if (!(ALLOWED_DOCUMENT_FORMATS as readonly string[]).includes(stored.format) || stored.bytes > MAX_DOCUMENT_BYTES) {
      await this.storage.destroy(publicId).catch(() => undefined);
      throw AppException.unprocessable(
        ErrorCode.INVALID_DOCUMENT,
        'El comprobante tiene que ser PDF, JPG, PNG o WebP de hasta 10 MB',
        { allowedFormats: ALLOWED_DOCUMENT_FORMATS, maxBytes: MAX_DOCUMENT_BYTES },
      );
    }
    return stored;
  }

  private async dropProof(t: TransferPayment): Promise<void> {
    if (!t.proofPublicId || !this.storage.configured) return;
    await this.storage.destroy(t.proofPublicId).catch((error: Error) => {
      this.logger.warn(`transfer no se pudo borrar un comprobante descartado: ${error.message}`);
    });
  }

  private async adminRow(id: string): Promise<AdminRow> {
    const [row] = await this.dataSource.query<AdminRow[]>(`${ADMIN_SELECT} WHERE t.id = $1`, [id]);
    if (!row) throw AppException.notFound('Pago');
    return row;
  }

  private assertStorage(): void {
    if (!this.storage.configured) {
      throw new AppException(
        ErrorCode.UPLOADS_NOT_CONFIGURED,
        'La carga de comprobantes todavía no está disponible',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }
}

const publicAccount = (a: TransferAccount): TransferAccount => ({
  holder: a.holder,
  alias: a.alias,
  cbu: a.cbu,
  bank: a.bank,
  cuit: a.cuit,
});

/** Lo que ve el propio profesional de un pago (sin notas internas ni quién lo revisó). */
function present(t: TransferPayment) {
  return {
    id: t.id,
    reference: t.reference,
    status: t.status,
    months: t.months,
    planTier: t.planTier,
    amountArs: t.amountArs,
    basePriceArs: t.basePriceArs,
    offerCode: t.offerCode,
    proofUploaded: !!t.proofPublicId,
    rejectionReason: t.status === TransferPaymentStatus.REJECTED ? t.rejectionReason : null,
    periodStart: t.periodStart,
    periodEnd: t.periodEnd,
    reviewedAt: t.reviewedAt,
    withdrawnAt: t.withdrawnAt,
    refundedAt: t.refundedAt,
    createdAt: t.createdAt,
  };
}

const ADMIN_SELECT = `
  SELECT t.*, u.id AS user_id, u.email, u.first_name, u.last_name, r.email AS reviewer_email
    FROM transfer_payments t
    JOIN professional_profiles p ON p.id = t.professional_id
    JOIN users u ON u.id = p.user_id
    LEFT JOIN users r ON r.id = t.reviewed_by_user_id`;

interface AdminRow {
  id: string;
  reference: string;
  status: TransferPaymentStatus;
  origin: TransferPaymentOrigin;
  months: number;
  plan_tier: PlanTier;
  amount_ars: number;
  base_price_ars: number;
  offer_code: string | null;
  proof_public_id: string | null;
  proof_format: string | null;
  proof_uploaded_at: Date | null;
  proof_deleted_at: Date | null;
  reviewed_at: Date | null;
  rejection_reason: string | null;
  admin_note: string | null;
  period_start: Date | null;
  period_end: Date | null;
  withdrawal_requested_at: Date | null;
  withdrawal_until: Date | null;
  withdrawn_at: Date | null;
  refund_destination: string | null;
  refunded_at: Date | null;
  created_at: Date;
  updated_at: Date;
  user_id: string;
  email: string;
  first_name: string;
  last_name: string;
  reviewer_email: string | null;
}

function presentAdmin(r: AdminRow, days: number) {
  return {
    id: r.id,
    reference: r.reference,
    status: r.status,
    origin: r.origin,
    months: r.months,
    planTier: r.plan_tier,
    amountArs: r.amount_ars,
    basePriceArs: r.base_price_ars,
    offerCode: r.offer_code,
    hasProof: !!r.proof_public_id && !r.proof_deleted_at,
    proofDeleted: !!r.proof_deleted_at,
    proofUploadedAt: r.proof_uploaded_at,
    reviewedAt: r.reviewed_at,
    reviewerEmail: r.reviewer_email,
    rejectionReason: r.rejection_reason,
    adminNote: r.admin_note,
    periodStart: r.period_start,
    periodEnd: r.period_end,
    withdrawalRequestedAt: r.withdrawal_requested_at,
    withdrawalUntil: transferWithdrawableUntil(
      { reviewedAt: r.reviewed_at, periodStart: r.period_start, withdrawalUntil: r.withdrawal_until },
      days,
    ),
    withdrawnAt: r.withdrawn_at,
    refundDestination: r.refund_destination,
    refundedAt: r.refunded_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    professional: {
      userId: r.user_id,
      email: r.email,
      name: `${r.first_name} ${r.last_name}`.trim(),
    },
  };
}

const notAvailable = () =>
  new AppException(
    ErrorCode.TRANSFER_NOT_AVAILABLE,
    'El pago por transferencia no está disponible en este momento.',
    HttpStatus.SERVICE_UNAVAILABLE,
  );
const blocked = (reason: TransferBlock) =>
  AppException.conflict(
    ErrorCode.TRANSFER_BLOCKED,
    reason === 'SUBSCRIPTION_ACTIVE'
      ? 'Ya pagás Resuelve PRO con Mercado Pago: no hace falta transferir.'
      : 'Ya tenés Resuelve PRO activo. No hace falta pagar.',
    { reason },
  );
const inReview = () =>
  AppException.conflict(ErrorCode.TRANSFER_IN_REVIEW, 'Estamos revisando tu transferencia. Te avisamos cuando la confirmemos.');
const noPending = () => AppException.conflict(ErrorCode.TRANSFER_NO_PENDING, 'No tenés un pago por transferencia en curso.');
const invalidState = () => AppException.conflict(ErrorCode.TRANSFER_INVALID_STATE, 'Ese pago ya no se puede cambiar.');
