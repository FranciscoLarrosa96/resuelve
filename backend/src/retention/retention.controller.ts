import { Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiNotFoundResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { RetentionService } from './retention.service';

/** "Mis profesionales" del cliente autenticado. Todo se resuelve por su propio `userId`: nunca se ve lo de otro. */
@ApiTags('retention')
@ApiBearerAuth()
@Controller('clients/me/professionals')
export class ClientProfessionalsController {
  constructor(private readonly retention: RetentionService) {}

  @Get()
  @ApiOkResponse({
    description:
      '{ hired, saved }. hired = profesionales con al menos un trabajo COMPLETED (último trabajo primero); ' +
      'saved = guardados a mano (último guardado primero). Cada ítem lleva `availability` ' +
      '(AVAILABLE | PAUSED | UNAVAILABLE) y `canRequest`.',
  })
  mine(@CurrentUser() user: AuthUser) {
    return this.retention.mine(user.userId);
  }

  @Get(':id')
  @ApiOkResponse({
    description:
      '{ saved, availability, jobsCount, lastCompletedAt, canRehire, rehireServiceId, jobs }: lo que el cliente tiene con ese profesional.',
  })
  @ApiNotFoundResponse({ description: 'No existe, o está pausado y no hay relación' })
  relationship(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.retention.relationship(user.userId, id);
  }
}

@ApiTags('retention')
@ApiBearerAuth()
@Controller('professionals/:id/favorite')
export class FavoritesController {
  constructor(private readonly retention: RetentionService) {}

  @Post()
  @HttpCode(200)
  @ApiOkResponse({ description: '{ saved: true }. Idempotente: guardar dos veces es lo mismo que una.' })
  @ApiNotFoundResponse({ description: 'El profesional no existe o está pausado' })
  save(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.retention.save(user.userId, id);
  }

  @Delete()
  @ApiOkResponse({ description: '{ saved: false }. Idempotente; no borra ningún historial de contrataciones.' })
  unsave(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.retention.unsave(user.userId, id);
  }
}
