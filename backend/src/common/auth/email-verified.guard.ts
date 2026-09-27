import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { emailVerificationEnabled } from '../../auth/email-verification-flag';
import { User } from '../../users/user.entity';
import { AppException } from '../errors/app-exception';
import { ErrorCode } from '../errors/error-codes';
import type { AuthUser } from './auth-user';

/**
 * Exige email verificado en acciones reales del marketplace (crear perfil
 * profesional, etc). Con `EMAIL_VERIFICATION_ENABLED=false` no exige nada.
 */
@Injectable()
export class EmailVerifiedGuard implements CanActivate {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!emailVerificationEnabled(this.config)) return true;
    const req = context.switchToHttp().getRequest<{ user: AuthUser }>();
    const user = await this.users.findOne({
      where: { id: req.user.userId },
      select: ['id', 'emailVerifiedAt'],
    });
    if (!user?.emailVerifiedAt) {
      throw AppException.forbidden(
        'Verificá tu email para crear tu perfil profesional.',
        ErrorCode.EMAIL_NOT_VERIFIED,
      );
    }
    return true;
  }
}
