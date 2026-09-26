import { Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiNotFoundResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { AudienceQueryDto, ListNotificationsQueryDto } from './dto/notification.dto';
import { NotificationsService } from './notifications.service';

/** Notificaciones in-app del usuario autenticado (sin push, email ni WebSocket: la app consulta). */
@ApiTags('notifications')
@ApiBearerAuth()
@Controller('me/notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get('summary')
  @ApiOkResponse({
    description:
      '{ client: { unread, completionDue }, professional: { unread, completionDue } | null }. ' +
      'completionDue = trabajos con horario confirmado ya terminado que siguen sin cerrar.',
  })
  summary(@CurrentUser() user: AuthUser) {
    return this.notifications.summary(user.userId);
  }

  @Get()
  @ApiOkResponse({ description: 'Últimas 50 del modo pedido, más nuevas primero.' })
  list(@CurrentUser() user: AuthUser, @Query() q: ListNotificationsQueryDto) {
    return this.notifications.list(user.userId, q.audience, !!q.unread);
  }

  @Patch('read-by-request/:requestId')
  @ApiOkResponse({
    description: 'Marca leídas las de esa solicitud (solo ese modo). Devuelve el resumen actualizado.',
  })
  @ApiNotFoundResponse({ description: 'La solicitud no es tuya en ese modo' })
  readByRequest(
    @CurrentUser() user: AuthUser,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Query() q: AudienceQueryDto,
  ) {
    return this.notifications.markReadByRequest(user.userId, requestId, q.audience);
  }
}
