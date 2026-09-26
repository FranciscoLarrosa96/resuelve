import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiForbiddenResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentProfessional, ProfessionalGuard } from '../common/auth/professional.guard';
import { ProfessionalProfile } from '../professionals/professional-profile.entity';
import { MonthQueryDto } from './analytics.dto';
import { AnalyticsService } from './analytics.service';

@ApiTags('pro')
@ApiBearerAuth()
@Controller('pro/analytics')
@UseGuards(ProfessionalGuard)
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  /**
   * "Tu mes": actividad real del profesional autenticado (nunca de otros).
   * `advanced` solo con el entitlement `canUseAdvancedAnalytics` y
   * `exposure` con `canSeeExposureAnalytics` (PRO vigente).
   */
  @Get('month')
  @ApiOkResponse({ description: '{ period, plan, basic, recentReviews, advanced | null }' })
  @ApiForbiddenResponse({ description: 'PROFESSIONAL_PROFILE_REQUIRED' })
  month(@CurrentProfessional() profile: ProfessionalProfile, @Query() query: MonthQueryDto) {
    return this.analytics.month(profile, query);
  }
}
