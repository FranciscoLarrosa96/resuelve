import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomInt, timingSafeEqual } from 'crypto';
import { IsNull, MoreThan, Repository } from 'typeorm';
import { AppException } from '../common/errors/app-exception';
import { ErrorCode } from '../common/errors/error-codes';
import { EmailService } from '../email/email.service';
import { User } from '../users/user.entity';
import { EmailVerificationCode, EmailVerificationPurpose } from './email-verification-code.entity';

const PURPOSE: EmailVerificationPurpose = 'EMAIL_VERIFICATION';
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

@Injectable()
export class EmailVerificationService {
  private readonly logger = new Logger(EmailVerificationService.name);

  constructor(
    @InjectRepository(EmailVerificationCode) private readonly codes: Repository<EmailVerificationCode>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly email: EmailService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Genera y envía un código nuevo, consumiendo el anterior. Aplica cooldown
   * de reenvío y tope de envíos por hora.
   */
  async sendCode(user: User): Promise<void> {
    if (user.emailVerifiedAt) {
      throw AppException.conflict(ErrorCode.EMAIL_ALREADY_VERIFIED, 'Tu email ya está verificado');
    }

    const last = await this.findActive(user.id);
    const cooldownMs = this.numberEnv('EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS', 60) * 1000;
    if (last && Date.now() - last.sentAt.getTime() < cooldownMs) {
      const retryInSeconds = Math.ceil((cooldownMs - (Date.now() - last.sentAt.getTime())) / 1000);
      throw new AppException(
        ErrorCode.EMAIL_VERIFICATION_COOLDOWN,
        `Esperá ${retryInSeconds} segundos antes de pedir otro código`,
        HttpStatus.TOO_MANY_REQUESTS,
        { retryInSeconds },
      );
    }

    const oneHourAgo = new Date(Date.now() - 60 * 60_000);
    const sentLastHour = await this.codes.count({
      where: { userId: user.id, purpose: PURPOSE, createdAt: MoreThan(oneHourAgo) },
    });
    const maxPerHour = this.numberEnv('EMAIL_VERIFICATION_MAX_SENDS_PER_HOUR', 5);
    if (sentLastHour >= maxPerHour) {
      throw new AppException(
        ErrorCode.EMAIL_VERIFICATION_RATE_LIMITED,
        'Alcanzaste el máximo de códigos por hora. Probá de nuevo más tarde.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Un solo código activo por usuario: el anterior queda inservible, aunque no haya vencido.
    await this.invalidateAll(user.id);

    const code = this.generateCode();
    const ttlMinutes = this.numberEnv('EMAIL_VERIFICATION_CODE_TTL_MINUTES', 10);
    const now = new Date();
    await this.codes.insert({
      userId: user.id,
      purpose: PURPOSE,
      codeHash: sha256(code),
      expiresAt: new Date(now.getTime() + ttlMinutes * 60_000),
      attempts: 0,
      sentAt: now,
      consumedAt: null,
    });

    this.logger.log({ userId: user.id }, 'verification email requested');
    try {
      await this.email.sendVerificationCode(user.email, code, ttlMinutes);
      this.logger.log({ userId: user.id }, 'verification email sent');
    } catch (err) {
      // No tumba el registro/pedido: el usuario puede reintentar con "Reenviar código".
      this.logger.error({ userId: user.id, err: (err as Error).message }, 'verification email failed');
    }
  }

  /** Valida el código y, si coincide, marca `emailVerifiedAt`. */
  async verifyCode(user: User, code: string): Promise<Date> {
    if (user.emailVerifiedAt) return user.emailVerifiedAt;

    const pending = await this.findActive(user.id);
    if (!pending) {
      throw new AppException(
        ErrorCode.EMAIL_VERIFICATION_INVALID_CODE,
        'Pedí un código nuevo para verificar tu email',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (pending.expiresAt <= new Date()) {
      throw new AppException(ErrorCode.EMAIL_VERIFICATION_EXPIRED, 'El código venció. Pedí uno nuevo.', HttpStatus.BAD_REQUEST);
    }
    const maxAttempts = this.numberEnv('EMAIL_VERIFICATION_MAX_ATTEMPTS', 5);
    if (pending.attempts >= maxAttempts) {
      throw new AppException(
        ErrorCode.EMAIL_VERIFICATION_TOO_MANY_ATTEMPTS,
        'Demasiados intentos. Pedí un código nuevo.',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!this.hashMatches(pending.codeHash, code)) {
      await this.codes.increment({ id: pending.id }, 'attempts', 1);
      this.logger.warn({ userId: user.id }, 'verification failed');
      throw new AppException(ErrorCode.EMAIL_VERIFICATION_INVALID_CODE, 'Código incorrecto', HttpStatus.BAD_REQUEST);
    }

    const verifiedAt = new Date();
    await this.codes.update(pending.id, { consumedAt: verifiedAt });
    await this.users.update(user.id, { emailVerifiedAt: verifiedAt });
    this.logger.log({ userId: user.id }, 'verification succeeded');
    return verifiedAt;
  }

  /** Usado tras `PATCH /auth/email`: descarta cualquier código pendiente del email anterior. */
  async invalidateAll(userId: string): Promise<void> {
    await this.codes
      .createQueryBuilder()
      .update()
      .set({ consumedAt: () => 'now()' })
      .where('user_id = :userId AND purpose = :purpose AND consumed_at IS NULL', { userId, purpose: PURPOSE })
      .execute();
  }

  /** El código activo más reciente (no consumido), venza o no. */
  private async findActive(userId: string): Promise<EmailVerificationCode | null> {
    return this.codes.findOne({
      where: { userId, purpose: PURPOSE, consumedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });
  }

  /** CSPRNG (no `Math.random()`): 6 dígitos, con ceros a la izquierda si hace falta. */
  private generateCode(): string {
    return randomInt(0, 1_000_000).toString().padStart(6, '0');
  }

  private hashMatches(storedHex: string, code: string): boolean {
    const a = Buffer.from(storedHex, 'hex');
    const b = Buffer.from(sha256(code), 'hex');
    return a.length === b.length && timingSafeEqual(a, b);
  }

  private numberEnv(key: string, fallback: number): number {
    return Number(this.config.get(key, fallback));
  }
}
