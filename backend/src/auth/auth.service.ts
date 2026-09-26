import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as argon2 from 'argon2';
import { createHash, randomUUID, timingSafeEqual } from 'crypto';
import { DataSource, EntityManager, IsNull, Repository } from 'typeorm';
import type { AccessTokenPayload } from '../common/auth/auth-user';
import { AppException } from '../common/errors/app-exception';
import { ErrorCode } from '../common/errors/error-codes';
import { Zone } from '../catalog/zone.entity';
import { User } from '../users/user.entity';
import { AuthTokensDto, LoginDto, RegisterDto } from './dto/auth.dto';
import { RefreshToken } from './refresh-token.entity';

interface RefreshTokenPayload {
  sub: string;
  jti: string;
  typ: 'refresh';
}

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  /** Hash de referencia para igualar tiempos cuando el email no existe. */
  private dummyHash?: Promise<string>;

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Zone) private readonly zones: Repository<Zone>,
    private readonly dataSource: DataSource,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthTokensDto> {
    const exists = await this.users
      .createQueryBuilder('u')
      .where('lower(u.email) = :email', { email: dto.email })
      .getExists();
    if (exists)
      throw AppException.conflict(ErrorCode.EMAIL_ALREADY_REGISTERED, 'Ya existe una cuenta con ese email');
    if (dto.defaultZoneId && !(await this.zones.existsBy({ id: dto.defaultZoneId, active: true }))) {
      throw AppException.unprocessable(ErrorCode.VALIDATION_ERROR, 'La zona indicada no existe');
    }

    const passwordHash = await argon2.hash(dto.password, { type: argon2.argon2id });
    const user = await this.users.save(
      this.users.create({
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        passwordHash,
        phone: dto.phone ?? null,
        defaultZoneId: dto.defaultZoneId ?? null,
      }),
    );
    this.logger.log({ userId: user.id }, 'Usuario registrado');
    return this.issueTokens(user);
  }

  async login(dto: LoginDto): Promise<AuthTokensDto> {
    const user = await this.users
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('lower(u.email) = :email', { email: dto.email })
      .getOne();

    // Mismo trabajo (y mismo error) exista o no el email: no revela cuentas.
    const hash = user?.passwordHash ?? (await this.getDummyHash());
    const valid = await argon2.verify(hash, dto.password).catch(() => false);
    if (!user || !valid) {
      throw new AppException(
        ErrorCode.INVALID_CREDENTIALS,
        'Email o contraseña incorrectos',
        HttpStatus.UNAUTHORIZED,
      );
    }
    return this.issueTokens(user);
  }

  /**
   * Rotación: cada refresh token sirve una vez. Si llega uno ya rotado:
   * - dentro de REFRESH_REUSE_GRACE_SECONDS y con su familia viva, es un
   *   reintento legítimo (una recarga cortó la respuesta y el navegador se
   *   quedó con el anterior, o una pestaña duplicada): se emite un hermano y
   *   el reemplazo anterior sigue valiendo;
   * - fuera de la ventana (o revocado por logout), es reuso: posible robo,
   *   se revocan todas las sesiones del usuario.
   * Todo en una transacción con el token bloqueado: dos refresh simultáneos
   * del mismo token se serializan y el segundo cae en la ventana.
   */
  async refresh(refreshToken: string): Promise<AuthTokensDto> {
    const payload = await this.verifyRefresh(refreshToken);
    const outcome = await this.dataSource.transaction(async (m) => {
      const stored = await m.findOne(RefreshToken, {
        where: { id: payload.jti },
        lock: { mode: 'pessimistic_write' },
      });
      if (!stored || stored.userId !== payload.sub || !this.hashMatches(stored.tokenHash, refreshToken))
        return { kind: 'invalid' as const };
      if (stored.revokedAt) {
        if (!stored.replacedById || !this.withinGrace(stored.revokedAt))
          return { kind: 'reused' as const, userId: stored.userId };
        // Rotado hace instantes: vale solo si la familia sigue viva (sin logout ni revocación por robo).
        if (!(await this.familyAlive(m, stored.replacedById))) return { kind: 'invalid' as const };
        const user = await m.findOneByOrFail(User, { id: stored.userId });
        return { kind: 'retry' as const, userId: user.id, tokens: await this.issueTokens(user, m) };
      }
      if (stored.expiresAt <= new Date()) return { kind: 'invalid' as const };
      const user = await m.findOneByOrFail(User, { id: stored.userId });
      const tokens = await this.issueTokens(user, m);
      // Revocado y enlazado en la misma transacción: nunca se ve "revocado sin reemplazo" por una rotación.
      await m.update(RefreshToken, stored.id, {
        revokedAt: new Date(),
        replacedById: this.jtiOf(tokens.refreshToken),
      });
      return { kind: 'ok' as const, tokens };
    });

    if (outcome.kind === 'reused') {
      // Fuera de la transacción anterior: la revocación tiene que persistir aunque respondamos 401.
      await this.dataSource
        .getRepository(RefreshToken)
        .update({ userId: outcome.userId, revokedAt: IsNull() }, { revokedAt: new Date() });
      this.logger.warn(
        { userId: outcome.userId },
        'Reuso de refresh token revocado: se cerraron todas las sesiones',
      );
      throw this.invalidRefresh();
    }
    if (outcome.kind === 'invalid') throw this.invalidRefresh();
    if (outcome.kind === 'retry')
      this.logger.log({ userId: outcome.userId }, 'Reintento de refresh dentro de la ventana de gracia');
    return outcome.tokens;
  }

  /** Idempotente: siempre responde 204, exista o no la sesión. */
  async logout(refreshToken: string): Promise<void> {
    try {
      const payload = await this.verifyRefresh(refreshToken);
      await this.dataSource
        .getRepository(RefreshToken)
        .update({ id: payload.jti, revokedAt: IsNull() }, { revokedAt: new Date() });
    } catch {
      /* token inválido o vencido: no hay nada que cerrar */
    }
  }

  private async issueTokens(
    user: User,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<AuthTokensDto> {
    const accessPayload: AccessTokenPayload = { sub: user.id, email: user.email, typ: 'access' };
    const accessToken = await this.jwt.signAsync(accessPayload, {
      secret: this.config.getOrThrow('JWT_ACCESS_SECRET'),
      expiresIn: this.config.getOrThrow('JWT_ACCESS_EXPIRES_IN'),
    });

    const jti = randomUUID();
    const refreshPayload: RefreshTokenPayload = { sub: user.id, jti, typ: 'refresh' };
    const refreshToken = await this.jwt.signAsync(refreshPayload, {
      secret: this.config.getOrThrow('JWT_REFRESH_SECRET'),
      expiresIn: this.config.getOrThrow('JWT_REFRESH_EXPIRES_IN'),
    });
    const { exp } = this.jwt.decode<{ exp: number }>(refreshToken);
    await manager.insert(RefreshToken, {
      id: jti,
      userId: user.id,
      tokenHash: sha256(refreshToken),
      expiresAt: new Date(exp * 1000),
    });

    const { exp: accessExp, iat } = this.jwt.decode<{ exp: number; iat: number }>(accessToken);
    return { accessToken, refreshToken, expiresIn: accessExp - iat, tokenType: 'Bearer' };
  }

  private async verifyRefresh(token: string): Promise<RefreshTokenPayload> {
    try {
      const payload = await this.jwt.verifyAsync<RefreshTokenPayload>(token, {
        secret: this.config.getOrThrow('JWT_REFRESH_SECRET'),
      });
      if (payload.typ !== 'refresh' || !payload.jti) throw new Error('wrong type');
      return payload;
    } catch {
      throw this.invalidRefresh();
    }
  }

  private withinGrace(revokedAt: Date): boolean {
    const graceMs = Number(this.config.get('REFRESH_REUSE_GRACE_SECONDS', 10)) * 1000;
    return Date.now() - revokedAt.getTime() <= graceMs;
  }

  /**
   * La familia sigue viva si, siguiendo los reemplazos desde `id`, se llega a
   * un token vigente. Un eslabón revocado sin reemplazo (logout, revocación
   * por reuso) o vencido la cierra.
   */
  private async familyAlive(m: EntityManager, id: string): Promise<boolean> {
    let next: string | null = id;
    for (let hops = 0; next && hops < 50; hops++) {
      const token: RefreshToken | null = await m.findOneBy(RefreshToken, { id: next });
      if (!token || token.expiresAt <= new Date()) return false;
      if (!token.revokedAt) return true;
      next = token.replacedById;
    }
    return false;
  }

  private hashMatches(storedHex: string, token: string): boolean {
    const a = Buffer.from(storedHex, 'hex');
    const b = Buffer.from(sha256(token), 'hex');
    return a.length === b.length && timingSafeEqual(a, b);
  }

  private jtiOf(token: string): string {
    return this.jwt.decode<RefreshTokenPayload>(token).jti;
  }

  private getDummyHash(): Promise<string> {
    this.dummyHash ??= argon2.hash(randomUUID(), { type: argon2.argon2id });
    return this.dummyHash;
  }

  private invalidRefresh(): AppException {
    return new AppException(
      ErrorCode.INVALID_REFRESH_TOKEN,
      'La sesión venció. Volvé a ingresar.',
      HttpStatus.UNAUTHORIZED,
    );
  }
}
