import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { FunnelEventType } from './funnel-event.entity';

/** Eventos que puede informar el frontend: el resto lo escribe el servidor en la acción real. */
export const CLIENT_FUNNEL_EVENTS = [
  FunnelEventType.PRO_PLAN_VIEWED,
  FunnelEventType.PRO_CTA_CLICKED,
] as const;
export type ClientFunnelEvent = (typeof CLIENT_FUNNEL_EVENTS)[number];

/** Dónde pasó (sin texto libre). */
export const FUNNEL_SURFACES = [
  'PLAN_PAGE',
  'REQUESTS_USAGE',
  'LIMIT_MODAL',
  'BLOCKED_OPPORTUNITY',
  'FIRST_SUCCESS',
  'MONTH',
  'PROFILE',
  'EARLY_ACCESS',
] as const;
export type FunnelSurface = (typeof FUNNEL_SURFACES)[number];

export class FunnelEventDto {
  @ApiProperty({ enum: CLIENT_FUNNEL_EVENTS })
  @IsIn(CLIENT_FUNNEL_EVENTS)
  type: ClientFunnelEvent;

  @ApiProperty({ enum: FUNNEL_SURFACES })
  @IsIn(FUNNEL_SURFACES)
  surface: FunnelSurface;
}
