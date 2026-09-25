import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { AppException } from '../errors/app-exception';
import { ErrorCode } from '../errors/error-codes';
import type { AccessTokenPayload, AuthUser } from './auth-user';
import { IS_PUBLIC_KEY } from './public.decorator';

/**
 * Guard global: todo endpoint exige `Authorization: Bearer <access token>`
 * salvo los marcados con @Public().
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const [scheme, token] = (req.headers.authorization ?? '').split(' ');
    if (scheme !== 'Bearer' || !token) throw this.unauthorized();

    try {
      const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });
      if (payload.typ !== 'access') throw new Error('wrong token type');
      req.user = { userId: payload.sub, email: payload.email };
      return true;
    } catch {
      throw this.unauthorized();
    }
  }

  private unauthorized(): AppException {
    return new AppException(ErrorCode.UNAUTHORIZED, 'Sesión inválida o vencida', HttpStatus.UNAUTHORIZED);
  }
}
