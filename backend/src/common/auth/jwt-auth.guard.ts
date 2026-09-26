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
 * salvo los marcados con @Public(). En los públicos, un token válido igual
 * completa `req.user` (opcional: uno inválido o ausente no falla).
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
    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const user = await this.verify(req.headers.authorization);
    if (user) req.user = user;
    if (isPublic || user) return true;
    throw this.unauthorized();
  }

  private async verify(header: string | undefined): Promise<AuthUser | null> {
    const [scheme, token] = (header ?? '').split(' ');
    if (scheme !== 'Bearer' || !token) return null;
    try {
      const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });
      return payload.typ === 'access' ? { userId: payload.sub, email: payload.email } : null;
    } catch {
      return null;
    }
  }

  private unauthorized(): AppException {
    return new AppException(ErrorCode.UNAUTHORIZED, 'Sesión inválida o vencida', HttpStatus.UNAUTHORIZED);
  }
}
