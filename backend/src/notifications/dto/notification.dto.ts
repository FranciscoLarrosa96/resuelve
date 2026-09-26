import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { NotificationAudience } from '../notification.entity';

export class AudienceQueryDto {
  @ApiProperty({
    enum: NotificationAudience,
    description: 'Modo: cliente o profesional (los contadores no se mezclan).',
  })
  @IsEnum(NotificationAudience)
  audience: NotificationAudience;
}

export class ListNotificationsQueryDto extends AudienceQueryDto {
  @ApiPropertyOptional({ description: 'Solo las no leídas.', default: false })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  unread?: boolean;
}
