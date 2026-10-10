import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

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
  @ApiPropertyOptional({ description: 'id de la localidad (preferido: el slug solo no identifica una ciudad)' })
  @IsOptional()
  @IsUUID()
  locality?: string;

  @ApiPropertyOptional({ description: 'LEGACY: slug de la ciudad. Si existe en varias provincias → 422 AMBIGUOUS_LOCALITY' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;
}
