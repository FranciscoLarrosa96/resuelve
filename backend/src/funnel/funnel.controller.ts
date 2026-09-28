import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import { CurrentProfessional, ProfessionalGuard } from '../common/auth/professional.guard';
import type { ProfessionalProfile } from '../professionals/professional-profile.entity';
import { recordFunnelEvent } from './funnel';
import { FunnelEventDto } from './funnel.dto';

@ApiTags('pro')
@ApiBearerAuth()
@Controller('pro/funnel-events')
export class FunnelController {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Vistas y clicks de PRO que solo conoce el frontend (`PRO_PLAN_VIEWED`,
   * `PRO_CTA_CLICKED`), por superficie. Uno por profesional + superficie +
   * día. El resto del embudo lo registra el servidor en la acción real.
   */
  @UseGuards(ProfessionalGuard)
  @Post()
  @HttpCode(200)
  @ApiOkResponse({ description: '{ recorded: boolean }' })
  async record(@CurrentProfessional() profile: ProfessionalProfile, @Body() dto: FunnelEventDto) {
    const recorded = await recordFunnelEvent(this.dataSource.manager, {
      type: dto.type,
      professionalId: profile.id,
      ref: dto.surface,
    });
    return { recorded };
  }
}
