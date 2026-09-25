import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

export class ScheduleAppointmentDto {
  @ApiProperty({ example: '2026-09-29T09:00:00-03:00' })
  @IsDateString()
  scheduledStart: string;

  @ApiProperty({ example: '2026-09-29T11:00:00-03:00' })
  @IsDateString()
  scheduledEnd: string;
}

export class AppointmentsQueryDto {
  @ApiPropertyOptional({ description: 'Desde (ISO). Por defecto: hoy.' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'Hasta (ISO). Por defecto: 7 días después de `from`.' })
  @IsOptional()
  @IsDateString()
  to?: string;
}
