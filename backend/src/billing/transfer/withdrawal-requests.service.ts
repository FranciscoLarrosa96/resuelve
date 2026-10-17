import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, MoreThan } from 'typeorm';
import { AppException } from '../../common/errors/app-exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { ProfessionalProfile } from '../../professionals/professional-profile.entity';
import { billingWithdrawalDays } from '../billing-rules';
import { TransferPayment, TransferPaymentStatus } from './transfer-payment.entity';
import { isValidRefundDestination, newWithdrawalRequestCode, transferWithdrawableUntil } from './transfer-rules';
import { WithdrawalContactRequest, WithdrawalContactStatus } from './withdrawal-contact-request.entity';
import type { WithdrawalContactRequestDto } from './transfer.dto';

const DAY_MS = 86_400_000;
/** Por correo y por día: sirve contra el abuso sin depender de si el correo pertenece a una cuenta. */
const PER_EMAIL_PER_DAY = 3;
/** Total por día para toda la plataforma (tope de seguridad; la IP ya está limitada por el throttler). */
const DAILY_CAP = Number(process.env.WITHDRAWAL_REQUESTS_DAILY_CAP ?? 300);

/**
 * Solicitudes de arrepentimiento SIN sesión ("No puedo ingresar a mi cuenta").
 *
 *  - Recibirlas NO consulta cuentas ni pagos: la respuesta es la misma exista o no la contratación
 *    (no revela ni confirma nada), y no modifica accesos, pagos ni devoluciones.
 *  - Se guarda la fecha y hora del servidor (`requestedAt`): es la que cuenta para el plazo aunque la
 *    verificación termine después.
 *  - Un admin verifica la identidad por fuera (con la persona) y la VINCULA con un pago: recién ahí queda
 *    registrada sobre ese pago, con la fecha original, y se resuelve con el flujo de siempre
 *    (`TransferService.resolveWithdrawal`).
 */
@Injectable()
export class WithdrawalRequestsService {
  private readonly logger = new Logger(WithdrawalRequestsService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  /** Comprobante para quien la envía: solo código y fecha. Nada de la cuenta ni del pago. */
  async submit(dto: WithdrawalContactRequestDto) {
    if (dto.consent !== true) {
      throw AppException.unprocessable(ErrorCode.VALIDATION_ERROR, 'Necesitamos tu consentimiento para usar estos datos y contactarte.');
    }
    const repo = this.dataSource.getRepository(WithdrawalContactRequest);
    const since = new Date(Date.now() - DAY_MS);
    const mine = await repo.find({ where: { email: dto.email, requestedAt: MoreThan(since) }, order: { requestedAt: 'DESC' } });
    // Reenvío idéntico (doble clic, reintento): el mismo comprobante, sin duplicar.
    const same = mine.find((r) => r.status === WithdrawalContactStatus.PENDING && (r.paymentReference ?? null) === (dto.paymentReference ?? null));
    if (same) return this.receipt(same);
    if (mine.length >= PER_EMAIL_PER_DAY || (await repo.countBy({ requestedAt: MoreThan(since) })) >= DAILY_CAP) {
      throw AppException.conflict(
        ErrorCode.WITHDRAWAL_REQUEST_LIMIT,
        'Ya recibimos varias solicitudes. Vamos a contactarte; si es urgente, volvé a intentar más tarde.',
      );
    }
    let saved: WithdrawalContactRequest | null = null;
    for (let attempt = 0; attempt < 5 && !saved; attempt++) {
      const code = newWithdrawalRequestCode();
      if (await repo.existsBy({ code })) continue;
      saved = await repo.save(
        repo.create({
          code,
          name: dto.name,
          email: dto.email,
          phone: dto.phone ?? null,
          paymentReference: dto.paymentReference ?? null,
          note: dto.note ?? null,
        }),
      );
    }
    if (!saved) throw new Error('No se pudo generar un código de solicitud único');
    // `requestedAt` lo puso la base (now()): se relee para devolver exactamente lo guardado.
    const stored = await repo.findOneByOrFail({ id: saved.id });
    this.logger.log(`withdrawal contact request received code=${stored.code}`);
    return this.receipt(stored);
  }

  private receipt(r: WithdrawalContactRequest) {
    return { code: r.code, requestedAt: r.requestedAt };
  }

  // ---- Admin ----------------------------------------------------------------

  async adminList(status?: string) {
    const rows = await this.dataSource.getRepository(WithdrawalContactRequest).find({
      where: status ? { status: status as WithdrawalContactStatus } : {},
      order: { requestedAt: 'ASC' },
      take: 200,
    });
    const pending = rows.filter((r) => r.status === WithdrawalContactStatus.PENDING).length;
    return { items: rows.map((r) => this.presentAdmin(r)), counts: { pending } };
  }

  /**
   * Vincula la solicitud con un pago (el admin ya verificó la identidad). El pago queda con una solicitud
   * registrada cuya fecha es la ORIGINAL de la solicitud sin sesión; se resuelve después con el flujo de siempre.
   * Si esa fecha ya estaba fuera de la ventana del pago, no se vincula (409): es una decisión comercial, no automática.
   */
  async link(id: string, adminId: string, reference: string, refundTo: string) {
    if (!isValidRefundDestination(refundTo)) {
      throw AppException.unprocessable(ErrorCode.VALIDATION_ERROR, 'El alias o CBU/CVU de devolución no es válido.');
    }
    const days = billingWithdrawalDays(this.config);
    await this.dataSource.transaction(async (m) => {
      const request = await m.findOne(WithdrawalContactRequest, { where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!request) throw AppException.notFound('Solicitud');
      if (request.status !== WithdrawalContactStatus.PENDING) throw invalidRequestState();
      const found = await m.findOne(TransferPayment, { where: { reference } });
      if (!found) throw AppException.notFound('Pago');
      await m.findOneOrFail(ProfessionalProfile, { where: { id: found.professionalId }, lock: { mode: 'pessimistic_write' } });
      const payment = await m.findOneOrFail(TransferPayment, { where: { id: found.id }, lock: { mode: 'pessimistic_write' } });
      if (payment.status !== TransferPaymentStatus.APPROVED) {
        throw AppException.conflict(ErrorCode.TRANSFER_INVALID_STATE, 'Ese pago no está confirmado, no hay nada para revocar.');
      }
      if (payment.withdrawalRequestedAt) {
        throw AppException.conflict(ErrorCode.TRANSFER_WITHDRAWAL_PENDING, 'Ese pago ya tiene una solicitud de arrepentimiento registrada.');
      }
      const until = transferWithdrawableUntil(payment, days);
      if (!until || until < request.requestedAt) {
        throw AppException.conflict(
          ErrorCode.TRANSFER_WITHDRAWAL_EXPIRED,
          `La solicitud se recibió después del plazo de ${days} días desde el inicio del período de ese pago.`,
        );
      }
      await m.update(TransferPayment, payment.id, {
        withdrawalRequestedAt: request.requestedAt, // fecha ORIGINAL de la solicitud sin sesión
        refundDestination: refundTo.trim(),
      });
      await m.update(WithdrawalContactRequest, id, {
        status: WithdrawalContactStatus.LINKED,
        linkedPaymentId: payment.id,
        handledByUserId: adminId,
        handledAt: new Date(),
      });
    });
    this.logger.log(`admin ${adminId} vinculó la solicitud ${id} con un pago`);
    return this.adminDetail(id);
  }

  async dismiss(id: string, adminId: string, note: string) {
    const result = await this.dataSource
      .createQueryBuilder()
      .update(WithdrawalContactRequest)
      .set({ status: WithdrawalContactStatus.DISMISSED, adminNote: note, handledByUserId: adminId, handledAt: () => 'now()' })
      .where('id = :id AND status = :s', { id, s: WithdrawalContactStatus.PENDING })
      .execute();
    if (!result.affected) {
      await this.adminDetail(id); // 404 si no existe
      throw invalidRequestState();
    }
    return this.adminDetail(id);
  }

  async adminDetail(id: string) {
    const r = await this.dataSource.getRepository(WithdrawalContactRequest).findOneBy({ id });
    if (!r) throw AppException.notFound('Solicitud');
    return this.presentAdmin(r);
  }

  private presentAdmin(r: WithdrawalContactRequest) {
    return {
      id: r.id,
      code: r.code,
      status: r.status,
      requestedAt: r.requestedAt,
      name: r.name,
      email: r.email,
      phone: r.phone,
      paymentReference: r.paymentReference,
      note: r.note,
      linkedPaymentId: r.linkedPaymentId,
      handledAt: r.handledAt,
      adminNote: r.adminNote,
    };
  }
}

function invalidRequestState(): AppException {
  return AppException.conflict(ErrorCode.TRANSFER_INVALID_STATE, 'La solicitud ya fue atendida.');
}
