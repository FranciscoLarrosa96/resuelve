import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { APPOINTMENT_DURATIONS } from '../appointment.entity';

export class ProposeAppointmentDto {
  @ApiProperty({
    example: '2026-09-29T10:00:00-03:00',
    description: 'Inicio (ISO con zona horaria). Tiene que ser futuro.',
  })
  @IsDateString({ strict: true })
  startsAt: string;

  @ApiProperty({ enum: APPOINTMENT_DURATIONS, example: 120, description: 'Duración estimada en minutos.' })
  @IsInt()
  @IsIn([...APPOINTMENT_DURATIONS])
  durationMinutes: number;

  @ApiPropertyOptional({ maxLength: 280, example: 'Llevo los materiales.' })
  @IsOptional()
  @IsString()
  @MaxLength(280)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  note?: string;

  @ApiPropertyOptional({
    description:
      'Cita activa (PROPOSED o CONFIRMED) que esta propuesta reemplaza ("Cambiar propuesta" / "Reprogramar"). ' +
      'Si hay una cita activa y no coincide (o no hay y se manda), responde 409 APPOINTMENT_STATE_CHANGED.',
  })
  @IsOptional()
  @IsUUID()
  replacesAppointmentId?: string;
}

export class AppointmentsQueryDto {
  @ApiPropertyOptional({ description: 'Desde (ISO). Por defecto: el inicio de hoy (hora de Argentina).' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'Hasta (ISO, excluido). Por defecto: 7 días después de `from`.' })
  @IsOptional()
  @IsDateString()
  to?: string;
}
