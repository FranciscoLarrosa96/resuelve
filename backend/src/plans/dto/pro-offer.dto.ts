import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Matches } from 'class-validator';
import { ProOfferEventType, ProOfferSurface } from '../pro-offer-event.entity';
import { OFFER_CODE_PATTERN } from '../pro-offers';

/** Código estable de una oferta. El descuento nunca viaja desde el frontend. */
const offerCode = () => Matches(OFFER_CODE_PATTERN, { message: 'offerCode inválido' });

/** POST /pro/plan/offer-events: solo SHOWN y CLICKED (REDEEMED lo escribe el servidor). */
export class ProOfferEventDto {
  @ApiProperty({ enum: [ProOfferEventType.SHOWN, ProOfferEventType.CLICKED] })
  @IsIn([ProOfferEventType.SHOWN, ProOfferEventType.CLICKED])
  type: ProOfferEventType.SHOWN | ProOfferEventType.CLICKED;

  @ApiProperty({ enum: ProOfferSurface })
  @IsIn(Object.values(ProOfferSurface))
  surface: ProOfferSurface;

  @ApiProperty({ example: 'PRO_FIRST_MONTH_20' })
  @IsString()
  @offerCode()
  offerCode: string;
}

/** POST /pro/plan/interest: opcionalmente, con qué oferta pide PRO. */
export class ProInterestDto {
  @ApiPropertyOptional({ example: 'PRO_FIRST_MONTH_20', description: 'Se guarda solo si hoy es elegible' })
  @IsOptional()
  @IsString()
  @offerCode()
  offerCode?: string;
}
