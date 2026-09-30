import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const MAX_AMOUNT = 1_000_000_000; // < numeric(12,2)

export class QuoteItemDto {
  @ApiProperty({ example: 'Disyuntor diferencial 2x25A' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  description: string;

  @ApiProperty({ example: 1 })
  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })
  @Min(0.01)
  @Max(100_000)
  quantity: number;

  @ApiProperty({ example: 12000, description: 'Precio unitario en pesos enteros ARS' })
  @IsInt()
  @Min(0)
  @Max(MAX_AMOUNT)
  unitPrice: number;
}

/**
 * No existe `totalAmount` en el DTO: el total lo calcula el servidor.
 * Si el cliente lo envía, la validación lo rechaza (forbidNonWhitelisted).
 */
export class CreateQuoteDto {
  @ApiProperty({ example: 'Revisión del circuito de cocina y cambio de térmica.' })
  @Transform(trim)
  @IsString()
  @MinLength(5)
  @MaxLength(2000)
  description: string;

  @ApiPropertyOptional({ example: 'Incluye retiro de materiales y limpieza básica.', maxLength: 1000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  note?: string;

  @ApiPropertyOptional({ example: '1 día', maxLength: 80 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  estimatedDuration?: string;

  @ApiProperty({ example: 38000 })
  @IsInt()
  @Min(0)
  @Max(MAX_AMOUNT)
  laborAmount: number;

  @ApiPropertyOptional({
    example: 12500,
    description: 'Se ignora si se envían `items` (materiales = suma de ítems)',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_AMOUNT)
  materialsAmount?: number;

  @ApiPropertyOptional({ type: [QuoteItemDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => QuoteItemDto)
  items?: QuoteItemDto[];

  @ApiPropertyOptional({ example: '2026-09-25T16:00:00-03:00' })
  @IsOptional()
  @IsDateString()
  availableFrom?: string;

  @ApiPropertyOptional({ example: '2026-10-02T23:59:59-03:00' })
  @IsOptional()
  @IsDateString()
  validUntil?: string;
}

export class UpdateQuoteDto extends CreateQuoteDto {}
