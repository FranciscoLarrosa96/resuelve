import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { ExposureEventType } from '../exposure-event.entity';

export const MAX_EVENTS_PER_BATCH = 50;

export class ExposureEventDto {
  @ApiProperty({ enum: ExposureEventType })
  @IsEnum(ExposureEventType)
  type: ExposureEventType;

  @ApiProperty()
  @IsUUID()
  professionalId: string;

  @ApiPropertyOptional({ description: 'Servicio buscado (solo SEARCH_IMPRESSION)' })
  @IsOptional()
  @IsUUID()
  serviceId?: string;

  @ApiPropertyOptional({ description: 'Barrio buscado (solo SEARCH_IMPRESSION)' })
  @IsOptional()
  @IsUUID()
  zoneId?: string;

  @ApiPropertyOptional({ description: 'Búsqueda "Disponible hoy"' })
  @IsOptional()
  @IsBoolean()
  isUrgent?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isFeaturedPlacement?: boolean;

  @ApiPropertyOptional({ minimum: 1, maximum: 500 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  page?: number;
}

export class ExposureEventsDto {
  @ApiProperty({ description: 'Clave anónima de la sesión del navegador (aleatoria, 16–64 caracteres)' })
  @Matches(/^[A-Za-z0-9_-]{16,64}$/)
  sessionKey: string;

  @ApiProperty({ type: [ExposureEventDto], maxItems: MAX_EVENTS_PER_BATCH })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_EVENTS_PER_BATCH)
  @ValidateNested({ each: true })
  @Type(() => ExposureEventDto)
  events: ExposureEventDto[];
}
