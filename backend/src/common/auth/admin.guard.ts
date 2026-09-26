import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../users/user.entity';
import type { AuthUser } from './auth-user';

/**
 * Endpoints /admin/*: exige `users.is_admin` leído de la base en CADA pedido
 * (no viaja en el token: quitar el rol corta el acceso al instante).
 * Quien no es admin recibe exactamente el mismo 404 que una ruta inexistente.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(@InjectRepository(User) private readonly users: Repository<User>) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{ user: AuthUser; method: string; originalUrl: string }>();
    const isAdmin = await this.users.exists({ where: { id: req.user.userId, isAdmin: true } });
    if (!isAdmin) throw new NotFoundException(`Cannot ${req.method} ${req.originalUrl.split('?')[0]}`);
    return true;
  }
}
