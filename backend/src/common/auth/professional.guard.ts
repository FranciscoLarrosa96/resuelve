import { CanActivate, createParamDecorator, ExecutionContext, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProfessionalProfile } from '../../professionals/professional-profile.entity';
import { AppException } from '../errors/app-exception';
import { ErrorCode } from '../errors/error-codes';
import type { AuthUser } from './auth-user';

type ProRequest = { user: AuthUser; professional?: ProfessionalProfile };

/** Endpoints /pro/*: exige que el usuario tenga ProfessionalProfile y lo deja en el request. */
@Injectable()
export class ProfessionalGuard implements CanActivate {
  constructor(
    @InjectRepository(ProfessionalProfile) private readonly profiles: Repository<ProfessionalProfile>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<ProRequest>();
    const profile = await this.profiles.findOneBy({ userId: req.user.userId });
    if (!profile) {
      throw AppException.forbidden(
        'Necesitás activar tu perfil profesional',
        ErrorCode.PROFESSIONAL_PROFILE_REQUIRED,
      );
    }
    req.professional = profile;
    return true;
  }
}

export const CurrentProfessional = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ProfessionalProfile => {
    return ctx.switchToHttp().getRequest<ProRequest>().professional!;
  },
);
