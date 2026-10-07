import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { PushEndpointDto, PushSubscriptionDto } from './push.dto';
import { PushSubscriptionsService } from './push-subscriptions.service';

/**
 * Avisos push del dispositivo actual. El endpoint viaja en el body (nunca en
 * la URL ni en los logs de requests).
 */
@ApiTags('notifications')
@ApiBearerAuth()
@Controller('me/push')
export class PushController {
  constructor(private readonly push: PushSubscriptionsService) {}

  @Get('config')
  @ApiOkResponse({ description: '{ enabled, publicKey }: enabled false = no se ofrecen avisos push.' })
  config() {
    return this.push.publicConfig();
  }

  @Post('subscriptions')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Alta (o actualización) de este dispositivo. 409 PUSH_DISABLED · 422 endpoint no admitido' })
  async subscribe(@CurrentUser() user: AuthUser, @Body() dto: PushSubscriptionDto) {
    await this.push.subscribe(user.userId, { endpoint: dto.endpoint, p256dh: dto.keys.p256dh, auth: dto.keys.auth });
  }

  @Post('subscriptions/status')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: '{ subscribed }: este dispositivo recibe los avisos de esta cuenta.' })
  async status(@CurrentUser() user: AuthUser, @Body() dto: PushEndpointDto) {
    return { subscribed: await this.push.has(user.userId, dto.endpoint) };
  }

  @Post('subscriptions/remove')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Baja de este dispositivo (idempotente; solo la propia).' })
  async unsubscribe(@CurrentUser() user: AuthUser, @Body() dto: PushEndpointDto) {
    await this.push.unsubscribe(user.userId, dto.endpoint);
  }
}
