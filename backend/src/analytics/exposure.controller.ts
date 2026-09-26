import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Public } from '../common/auth/public.decorator';
import { ExposureEventsDto } from './dto/exposure-events.dto';
import { ExposureService } from './exposure.service';

/** Tandas por minuto e IP: el frontend agrupa (cada ~2 s como mucho). */
const EVENTS_LIMIT = Number(process.env.THROTTLE_EVENTS_LIMIT ?? 30);

@ApiTags('analytics')
@Controller('analytics')
export class ExposureController {
  constructor(private readonly exposure: ExposureService) {}

  /**
   * Apariciones en búsquedas y visitas al perfil, en tandas (hasta 50).
   * Público: con sesión iniciada, la exposición propia no cuenta.
   */
  @Public()
  @Post('events')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: EVENTS_LIMIT, ttl: 60_000 } })
  @ApiOkResponse({ description: '{ accepted } = eventos nuevos (los duplicados no suman)' })
  record(@Body() dto: ExposureEventsDto, @CurrentUser() user?: AuthUser) {
    return this.exposure.record(dto, user);
  }
}
