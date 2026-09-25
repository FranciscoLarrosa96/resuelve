import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ServicesQueryDto {
  @ApiPropertyOptional({ description: 'Slug de la categoría (ej. hogar-y-reparaciones)' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  category?: string;

  @ApiPropertyOptional({ description: 'Búsqueda por nombre (ej. "pasto")' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;
}

export class ZonesQueryDto {
  @ApiPropertyOptional({ description: 'Slug de la ciudad', default: 'tandil' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;
}
