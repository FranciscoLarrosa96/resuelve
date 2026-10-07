import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiConflictResponse, ApiExcludeController } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AdminGuard } from '../common/auth/admin.guard';
import type { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { AdminUsersService } from './admin-users.service';
import { AdminUsersQueryDto, GrantProDto, PurgeUserDto } from './admin.dto';

const ADMIN_WRITE_LIMIT = Number(process.env.THROTTLE_ADMIN_LIMIT ?? 30);

/**
 * Gestión de usuarios. Solo `is_admin` (AdminGuard: 404 para el resto).
 * "Dar de baja" = la misma baja de cuenta (anonimiza, conserva el historial ajeno);
 * "Borrar definitivamente" = DELETE con CASCADE, pensado para cuentas de prueba.
 * Plan: dar/quitar PRO manual de cortesía y cancelar la renovación de Mercado Pago.
 */
@ApiExcludeController()
@ApiBearerAuth()
@UseGuards(AdminGuard)
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly users: AdminUsersService) {}

  @Get()
  list(@Query() query: AdminUsersQueryDto) {
    return this.users.list(query);
  }

  @Get(':id')
  show(@Param('id', ParseUUIDPipe) id: string) {
    return this.users.show(id);
  }

  @Post(':id/deactivate')
  @HttpCode(200)
  @Throttle({ default: { limit: ADMIN_WRITE_LIMIT, ttl: 60_000 } })
  @ApiConflictResponse({ description: 'ACCOUNT_DELETE_BLOCKED (details.blockers) | ADMIN_USER_PROTECTED' })
  deactivate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() admin: AuthUser) {
    return this.users.deactivate(id, admin.userId);
  }

  @Post(':id/plan/grant')
  @HttpCode(200)
  @Throttle({ default: { limit: ADMIN_WRITE_LIMIT, ttl: 60_000 } })
  @ApiConflictResponse({ description: 'ADMIN_PLAN_BLOCKED (dada de baja o suscripción paga viva) · 404 sin perfil' })
  grantPro(@Param('id', ParseUUIDPipe) id: string, @Body() dto: GrantProDto, @CurrentUser() admin: AuthUser) {
    return this.users.grantPro(id, admin.userId, dto.days);
  }

  @Post(':id/plan/revoke')
  @HttpCode(200)
  @Throttle({ default: { limit: ADMIN_WRITE_LIMIT, ttl: 60_000 } })
  revokePro(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() admin: AuthUser) {
    return this.users.revokePro(id, admin.userId);
  }

  @Post(':id/subscription/cancel')
  @HttpCode(200)
  @Throttle({ default: { limit: ADMIN_WRITE_LIMIT, ttl: 60_000 } })
  @ApiConflictResponse({ description: 'BILLING_NO_SUBSCRIPTION · 502 BILLING_PROVIDER_ERROR · 503 BILLING_NOT_CONFIGURED' })
  cancelSubscription(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() admin: AuthUser) {
    return this.users.cancelSubscription(id, admin.userId);
  }

  @Post(':id/purge')
  @HttpCode(200)
  @Throttle({ default: { limit: ADMIN_WRITE_LIMIT, ttl: 60_000 } })
  @ApiConflictResponse({ description: 'ADMIN_USER_PROTECTED · 422 ADMIN_CONFIRM_MISMATCH · 502 ACCOUNT_DELETE_FAILED' })
  purge(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PurgeUserDto, @CurrentUser() admin: AuthUser) {
    return this.users.purge(id, admin.userId, dto.confirmEmail);
  }
}
