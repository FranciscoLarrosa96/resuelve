import { Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiNotFoundResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { AudienceQueryDto, ListNotificationsQueryDto, ReadByRequestQueryDto } from './dto/notification.dto';
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
      '{ client: { unread, completionDue }, professional: { unread, completionDue, ' +
      'requests: { total, PENDING, QUOTED, SELECTED }, agenda } | null }. ' +
      'requests/agenda = novedades agrupadas por dónde está la acción. ' +
      'completionDue = trabajos con horario confirmado ya terminado que siguen sin cerrar.',
  })
  summary(@CurrentUser() user: AuthUser) {
    return this.notifications.summary(user.userId);
  }

  @Get('unread-count')
  @ApiOkResponse({ description: '{ unread }: sin leer del modo pedido. Un COUNT por índice, sin cargar la lista.' })
  async unreadCount(@CurrentUser() user: AuthUser, @Query() q: AudienceQueryDto) {
    return { unread: await this.notifications.unreadCount(user.userId, q.audience) };
  }

  @Get()
  @ApiOkResponse({
    description: 'Paginado (20 por página): { items, page, pageSize, total }. Más nuevas primero, solo las del modo pedido.',
  })
  list(@CurrentUser() user: AuthUser, @Query() q: ListNotificationsQueryDto) {
    return this.notifications.list(user.userId, q.audience, {
      unreadOnly: !!q.unread,
      page: q.page,
      pageSize: q.pageSize,
    });
  }

  @Patch('read-all')
  @ApiOkResponse({ description: 'Marca leídas todas las del modo pedido. Devuelve el resumen actualizado.' })
  readAll(@CurrentUser() user: AuthUser, @Query() q: AudienceQueryDto) {
    return this.notifications.markAllRead(user.userId, q.audience);
  }

  @Patch(':id/read')
  @ApiOkResponse({ description: 'Abre una notificación propia (queda leída). Devuelve el resumen actualizado.' })
  @ApiNotFoundResponse({ description: 'No existe o es de otra persona' })
  read(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.notifications.markRead(user.userId, id);
  }

  @Patch('read-by-request/:requestId')
  @ApiOkResponse({
    description: 'Marca leídas las de esa solicitud (solo ese modo). Devuelve el resumen actualizado.',
  })
  @ApiNotFoundResponse({ description: 'La solicitud no es tuya en ese modo' })
  readByRequest(
    @CurrentUser() user: AuthUser,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Query() q: ReadByRequestQueryDto,
  ) {
    return this.notifications.markReadByRequest(user.userId, requestId, q.audience, q.section);
  }
}
