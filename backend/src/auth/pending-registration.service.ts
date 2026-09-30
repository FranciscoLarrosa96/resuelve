import { validateReferral } from '../acquisition/referrals';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as argon2 from 'argon2';
import { createHash, randomInt, timingSafeEqual } from 'crypto';
import { DataSource, EntityManager, LessThan, Repository } from 'typeorm';
import { AppException } from '../common/errors/app-exception';
import { ErrorCode } from '../common/errors/error-codes';
import { maskEmail } from '../common/mask-email';
import { Zone } from '../catalog/zone.entity';
import { EmailService } from '../email/email.service';
import { User } from '../users/user.entity';
import { RegisterDto } from './dto/auth.dto';
import { PendingRegistration } from './pending-registration.entity';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

export interface PendingRegistrationResult {
  verificationRequired: true;
  verificationSessionId: string;
  maskedEmail: string;
}

/**
 * Registro pendiente: mientras no se verifica el código, NO existe ningún
 * `User` para ese email. `AuthService.verifyPendingRegistration` es quien,
 * dentro de una transacción con la fila bloqueada, crea el `User` real.
 */
@Injectable()
export class PendingRegistrationService {
  private readonly logger = new Logger(PendingRegistrationService.name);

  constructor(
    @InjectRepository(PendingRegistration) private readonly pending: Repository<PendingRegistration>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Zone) private readonly zones: Repository<Zone>,
    private readonly dataSource: DataSource,
    private readonly email: EmailService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Crea (o reemplaza) el registro pendiente para este email. Un advisory
   * lock por email serializa altas concurrentes con el mismo email: nunca
   * quedan dos filas pendientes para el mismo email (ver README → Auth).
   */
  async register(dto: RegisterDto): Promise<PendingRegistrationResult> {
    const exists = await this.users
      .createQueryBuilder('u')
      .where('lower(u.email) = :email', { email: dto.email })
      .getExists();
    if (exists) {
      throw AppException.conflict(ErrorCode.EMAIL_ALREADY_REGISTERED, 'Ya existe una cuenta con ese email');
    }
    if (dto.defaultZoneId && !(await this.zones.existsBy({ id: dto.defaultZoneId, active: true }))) {
      throw AppException.unprocessable(ErrorCode.VALIDATION_ERROR, 'La zona indicada no existe');
    }

    // Oportunista: no necesitamos cron para que esta tabla no crezca sin límite.
    await this.pending.delete({ expiresAt: LessThan(new Date()) });

    const passwordHash = await argon2.hash(dto.password, { type: argon2.argon2id });

    return this.dataSource.transaction(async (m) => {
      await m.query('SELECT pg_advisory_xact_lock(hashtext($1))', [dto.email]);

      if (dto.referralCode && !this.config.get<boolean>('REFERRALS_ENABLED', true))
        throw AppException.unprocessable(
          ErrorCode.VALIDATION_ERROR,
          'Las invitaciones no están disponibles.',
        );
      await validateReferral(m, dto.referralCode);
      const existing = await m.findOne(PendingRegistration, { where: { email: dto.email } });
      const now = new Date();

      // Dentro del cooldown: no reenvía ni pisa el código vigente (evita spam de un
      // re-registro repetido), pero responde igual con el mismo session id.
      const cooldownMs = this.numberEnv('EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS', 60) * 1000;
      if (existing && now.getTime() - existing.lastCodeSentAt.getTime() < cooldownMs) {
        return {
          verificationRequired: true,
          verificationSessionId: existing.id,
          maskedEmail: maskEmail(dto.email),
        };
      }

      const ttlHours = this.numberEnv('PENDING_REGISTRATION_TTL_HOURS', 24);
      const codeTtlMinutes = this.numberEnv('EMAIL_VERIFICATION_CODE_TTL_MINUTES', 10);
      const code = this.generateCode();

      const row: Partial<PendingRegistration> = {
        referralCode: existing?.referralCode ?? dto.referralCode ?? null,
        email: dto.email,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone ?? null,
        defaultZoneId: dto.defaultZoneId ?? null,
        passwordHash,
        verificationCodeHash: sha256(code),
        verificationExpiresAt: new Date(now.getTime() + codeTtlMinutes * 60_000),
        verificationAttempts: 0,
        lastCodeSentAt: now,
        expiresAt: new Date(now.getTime() + ttlHours * 60 * 60_000),
      };

      const id = existing
        ? (await m.update(PendingRegistration, existing.id, row), existing.id)
        : (await m.insert(PendingRegistration, row)).identifiers[0].id;

      this.logger.log({ pendingId: id }, 'verification email requested');
      try {
        await this.email.sendVerificationCode(dto.email, code, codeTtlMinutes);
        this.logger.log({ pendingId: id }, 'verification email sent');
      } catch (err) {
        this.logger.error({ pendingId: id, err: (err as Error).message }, 'verification email failed');
      }

      return {
        verificationRequired: true,
        verificationSessionId: id as string,
        maskedEmail: maskEmail(dto.email),
      };
    });
  }

  /** Reenvía el código de un registro pendiente existente (identificado solo por el session id, no por email). */
  async resend(sessionId: string): Promise<void> {
    const pending = await this.pending.findOneBy({ id: sessionId });
    if (!pending || pending.expiresAt <= new Date()) {
      throw new AppException(
        ErrorCode.PENDING_REGISTRATION_EXPIRED,
        'Tu registro venció. Volvé a crear tu cuenta.',
        410,
      );
    }

    const cooldownMs = this.numberEnv('EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS', 60) * 1000;
    const elapsed = Date.now() - pending.lastCodeSentAt.getTime();
    if (elapsed < cooldownMs) {
      const retryInSeconds = Math.ceil((cooldownMs - elapsed) / 1000);
      throw new AppException(
        ErrorCode.EMAIL_VERIFICATION_COOLDOWN,
        `Esperá ${retryInSeconds} segundos antes de pedir otro código`,
        429,
        { retryInSeconds },
      );
    }

    const now = new Date();
    const codeTtlMinutes = this.numberEnv('EMAIL_VERIFICATION_CODE_TTL_MINUTES', 10);
    const code = this.generateCode();
    await this.pending.update(pending.id, {
      verificationCodeHash: sha256(code),
      verificationExpiresAt: new Date(now.getTime() + codeTtlMinutes * 60_000),
      verificationAttempts: 0,
      lastCodeSentAt: now,
    });

    this.logger.log({ pendingId: pending.id }, 'verification email requested');
    try {
      await this.email.sendVerificationCode(pending.email, code, codeTtlMinutes);
      this.logger.log({ pendingId: pending.id }, 'verification email sent');
    } catch (err) {
      this.logger.error({ pendingId: pending.id, err: (err as Error).message }, 'verification email failed');
    }
  }

  /** Fila bloqueada (`FOR UPDATE`) para que `AuthService` la consuma dentro de su propia transacción. */
  async lockById(manager: EntityManager, id: string): Promise<PendingRegistration | null> {
    return manager.findOne(PendingRegistration, { where: { id }, lock: { mode: 'pessimistic_write' } });
  }

  async recordFailedAttempt(manager: EntityManager, id: string): Promise<void> {
    await manager.increment(PendingRegistration, { id }, 'verificationAttempts', 1);
  }

  async consume(manager: EntityManager, id: string): Promise<void> {
    await manager.delete(PendingRegistration, id);
  }

  hashMatches(pending: PendingRegistration, code: string): boolean {
    const a = Buffer.from(pending.verificationCodeHash, 'hex');
    const b = Buffer.from(sha256(code), 'hex');
    return a.length === b.length && timingSafeEqual(a, b);
  }

  maxAttempts(): number {
    return this.numberEnv('EMAIL_VERIFICATION_MAX_ATTEMPTS', 5);
  }

  private generateCode(): string {
    return randomInt(0, 1_000_000).toString().padStart(6, '0');
  }

  private numberEnv(key: string, fallback: number): number {
    return Number(this.config.get(key, fallback));
  }
}
