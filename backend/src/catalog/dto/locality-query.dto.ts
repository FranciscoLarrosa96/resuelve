import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class LocalitySearchDto {
  @ApiPropertyOptional({
    description: 'Texto (sin importar tildes ni mayúsculas). Vacío = ciudades con profesionales.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  search?: string;

  @ApiPropertyOptional({ description: 'Provincia: slug (buenos-aires) o id' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  province?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 20, default: 8 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit = 8;
}

export class LocalityDetailQueryDto {
  @ApiPropertyOptional({ description: 'Servicio (slug o id): suma `professionalsCount` de ese servicio' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  service?: string;
}

export class ServedLocalitiesQueryDto {
  @ApiPropertyOptional({
    description: 'Servicio (slug o id): solo localidades con profesionales de ese servicio',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  service?: string;
}
