import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const MAX_AMOUNT = 1_000_000_000;

/** Mismos límites que `CreateQuoteDto` (una plantilla vuelve al mismo formulario). */
export class CreateQuoteTemplateDto {
  @ApiProperty({ example: 'Cambio de sifón' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name: string;

  @ApiProperty({ example: 'Cambio de sifón y flexibles de la bacha de la cocina.' })
  @Transform(trim)
  @IsString()
  @MinLength(5)
  @MaxLength(2000)
  description: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  note?: string;

  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  estimatedDuration?: string;

  @ApiProperty({ example: 25000 })
  @IsInt()
  @Min(0)
  @Max(MAX_AMOUNT)
  laborAmount: number;

  @ApiProperty({ example: 9000 })
  @IsInt()
  @Min(0)
  @Max(MAX_AMOUNT)
  materialsAmount: number;
}
