import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import type { ProfessionalProfile } from '../professionals/professional-profile.entity';
import { ProOfferEventDto } from './dto/pro-offer.dto';
import { ProOfferEvent } from './pro-offer-event.entity';
import { findOffer, offerEventDedupeKey, offerReason } from './pro-offers';
import { monthlyQuoteUsage } from './quote-quota';

/**
 * Embudo de ofertas (mostrada / click). Solo cuenta si el profesional HOY es
 * elegible para ese código: un código inventado, una oferta apagada o alguien
 * que ya no califica se descartan en silencio (no hay nada que medir).
 */
@Injectable()
export class ProOffersService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  async recordEvent(profile: ProfessionalProfile, dto: ProOfferEventDto): Promise<{ recorded: boolean }> {
    const offer = findOffer(this.config, dto.offerCode);
    if (!offer) return { recorded: false };
    const m = this.dataSource.manager;
    const used = await monthlyQuoteUsage(m, profile.id);
    if (await offerReason(m, offer, profile, used, this.config)) return { recorded: false };
    const result = await m
      .createQueryBuilder()
      .insert()
      .into(ProOfferEvent)
      .values({
        type: dto.type,
        surface: dto.surface,
        professionalId: profile.id,
        offerCode: offer.code,
        dedupeKey: offerEventDedupeKey(dto.type, profile.id, offer.code, dto.surface),
      })
      .orIgnore()
      .returning('id')
      .execute();
    return { recorded: (result.raw as unknown[]).length > 0 };
  }
}
