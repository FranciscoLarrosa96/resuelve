import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { RequestAttributionSource } from '../../requests/request-invitation.entity';
import { CLIENT_EVENT_TYPES, DEFAULT_FLOW_VERSION, FLOW_VERSIONS, JOURNEYS, MAX_STEP } from './request-journey';

export const MAX_JOURNEY_EVENTS_PER_BATCH = 10;

export class JourneyEventDto {
  @ApiProperty({ enum: CLIENT_EVENT_TYPES })
  @IsIn(CLIENT_EVENT_TYPES)
  type: (typeof CLIENT_EVENT_TYPES)[number];

  @ApiPropertyOptional({ description: 'Solo STEP_VIEWED: 0 a 4 (hasta 3 en la versión 2)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MAX_STEP)
  step?: number;

  @ApiPropertyOptional({ enum: RequestAttributionSource, description: 'Solo STARTED: cómo llegó' })
  @IsOptional()
  @IsEnum(RequestAttributionSource)
  entry?: RequestAttributionSource;
}

export class RequestJourneyDto {
  @ApiProperty({ description: 'Clave aleatoria del intento (UUID creado por el navegador)' })
  @IsUUID()
  attemptId: string;

  @ApiProperty({ enum: JOURNEYS })
  @IsIn(JOURNEYS)
  journey: (typeof JOURNEYS)[number];

  @ApiPropertyOptional({
    enum: FLOW_VERSIONS,
    default: DEFAULT_FLOW_VERSION,
    description: 'Versión de la interfaz que emitió los eventos. Sin ella (navegador viejo) es la 1.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsIn(FLOW_VERSIONS)
  flowVersion?: (typeof FLOW_VERSIONS)[number];

  @ApiProperty({ type: [JourneyEventDto], maxItems: MAX_JOURNEY_EVENTS_PER_BATCH })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_JOURNEY_EVENTS_PER_BATCH)
  @ValidateNested({ each: true })
  @Type(() => JourneyEventDto)
  events: JourneyEventDto[];
}
