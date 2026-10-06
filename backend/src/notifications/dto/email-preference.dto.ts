import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsString, MaxLength, MinLength } from 'class-validator';

export class SetEmailPreferenceDto {
  @ApiProperty({ description: 'true = recibir avisos de actividad por email.' })
  @IsBoolean()
  enabled: boolean;
}

export class EmailUnsubscribeDto {
  @ApiProperty({ description: 'Token del enlace de baja que viaja en cada aviso.' })
  @IsString()
  @MinLength(40)
  @MaxLength(200)
  token: string;
}
