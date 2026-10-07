import { currentBusinessMonth } from '../common/time';
import { Controller, Get, HttpCode, Module, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CurrentProfessional, ProfessionalGuard } from '../common/auth/professional.guard';
import { ProfessionalProfile } from '../professionals/professional-profile.entity';
import { MonthQueryDto } from '../analytics/analytics.dto';
import { resolveProfessionalEntitlements } from '../plans/plan';
import { acknowledgeReferralCelebration, activateReferral, incomingReferral, referrerAllowance } from './referrals';

@Controller('pro/acquisition')
@UseGuards(ProfessionalGuard)
class AcquisitionController {
  constructor(
    private readonly db: DataSource,
    private readonly config: ConfigService,
  ) {}

  @Get('referrals')
  async referrals(@CurrentProfessional() p: ProfessionalProfile) {
    const enabled = this.config.get<boolean>('REFERRALS_ENABLED', true);
    const items = enabled
      ? await this.db.query(
          `SELECT r.id, u.first_name AS "firstName", left(u.last_name,1) AS "lastInitial",
      r.status, r.registered_at AS "registeredAt", r.activated_at AS "activatedAt", r.rewarded_at AS "rewardedAt",
      rw.days AS "rewardDays", rw.access_until AS "accessUntil"
      FROM referrals r JOIN users u ON u.id = r.referred_user_id LEFT JOIN referral_rewards rw ON rw.referral_id = r.id AND rw.professional_id = $1
      WHERE r.referrer_professional_id = $1 ORDER BY r.registered_at DESC LIMIT 100`,
          [p.id],
        )
      : [];
    const [counts] = await this.db.query(
      `SELECT count(*)::int AS registered,
      count(*) FILTER(WHERE status IN ('ACTIVATED','REWARDED'))::int AS activated,
      count(*) FILTER(WHERE status = 'REWARDED')::int AS rewarded
      FROM referrals WHERE referrer_professional_id = $1`,
      [p.id],
    );
    return {
      enabled,
      code: enabled ? p.referralCode : null,
      rewardsEnabled: this.config.get<boolean>('REFERRAL_REWARDS_ENABLED', true),
      rewardDays: this.config.get<number>('REFERRAL_REWARD_DAYS', 15),
      items,
      counts,
      ...(await referrerAllowance(this.db, p.id, this.config)),
      incoming: await incomingReferral(this.db, p.id, this.config),
    };
  }

  /**
   * Invitación anterior a la regla nueva (quedó REGISTERED con el perfil ya
   * creado): la misma activación del alta. Idempotente; sin invitación, no hace nada.
   */
  @Post('referrals/claim')
  @HttpCode(200)
  async claim(@CurrentProfessional() p: ProfessionalProfile) {
    await this.db.transaction((m) => activateReferral(m, p.id, this.config));
    return { incoming: await incomingReferral(this.db, p.id, this.config) };
  }

  /** Cierra el festejo de un premio propio (una sola vez). */
  @Post('referrals/celebrations/:rewardId/ack')
  @HttpCode(200)
  async acknowledge(
    @CurrentProfessional() p: ProfessionalProfile,
    @Param('rewardId', ParseUUIDPipe) rewardId: string,
  ) {
    await acknowledgeReferralCelebration(this.db, p.id, rewardId);
    return { acknowledged: true };
  }

  @Get('month')
  async month(@CurrentProfessional() p: ProfessionalProfile, @Query() q: MonthQueryDto) {
    if (!resolveProfessionalEntitlements(p).canUseAdvancedAnalytics) return { available: false };
    const now = new Date();
    const current = currentBusinessMonth(now);
    const year = q.year ?? current.year;
    const month = q.month ?? current.month;
    const params = [p.id, `${year}-${String(month).padStart(2, '0')}-01`];
    const [visits] = await this.db.query(
      `SELECT count(*)::int AS count FROM exposure_events
      WHERE professional_id = $1 AND type = 'PROFILE_VIEW'
      AND occurred_at >= ($2::date::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires')
      AND occurred_at < (($2::date + interval '1 month')::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires')`,
      params,
    );
    const rows = await this.db.query(
      `SELECT sr.acquisition_source AS source, count(*)::int AS count FROM request_invitations i JOIN service_requests sr ON sr.id = i.request_id
      WHERE professional_id = $1 AND sent_at >= ($2::date::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires')
      AND sent_at < (($2::date + interval '1 month')::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires')
      GROUP BY sr.acquisition_source`,
      params,
    );
    const count = (source: string) =>
      rows.find((r: { source: string; count: number }) => r.source === source)?.count ?? 0;
    return {
      available: true,
      profileVisits: visits.count,
      publicProfile: count('PUBLIC_PROFILE'),
      qr: count('PROFILE_QR'),
      share: count('PROFILE_SHARE'),
    };
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([ProfessionalProfile])],
  controllers: [AcquisitionController],
  providers: [ProfessionalGuard],
})
export class AcquisitionModule {}
