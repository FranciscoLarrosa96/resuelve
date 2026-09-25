import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/pagination';
import { VerificationType } from '../professional.enums';

const toBool = ({ value }: { value: unknown }) =>
  value === 'true' || value === true ? true : value === 'false' || value === false ? false : value;

export class SearchProfessionalsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Servicio: id o slug (ej. plomeria)' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  service?: string;

  @ApiPropertyOptional({ description: 'Zona: id o slug (ej. villa-italia)' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  zone?: string;

  @ApiPropertyOptional({ description: 'Solo quienes marcaron "Disponible hoy"' })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  availableToday?: boolean;

  @ApiPropertyOptional({ description: 'Solo con matrícula verificada' })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  licenseVerified?: boolean;

  @ApiPropertyOptional({ minimum: 0, maximum: 5, example: 4.5 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(5)
  minRating?: number;
}

export class CreateProfessionalProfileDto {
  @ApiProperty({ example: 'Electricista matriculado' })
  @IsString()
  @MaxLength(120)
  headline: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  bio?: string;

  @ApiProperty({ minimum: 0, maximum: 70 })
  @IsInt()
  @Min(0)
  @Max(70)
  yearsExperience: number;

  @ApiProperty({ type: [String], description: 'ids de servicios que ofrece' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  serviceIds: string[];

  @ApiProperty({ type: [String], description: 'ids de zonas donde trabaja' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  zoneIds: string[];
}

/** Métricas, plan y verificaciones NO se aceptan acá (forbidNonWhitelisted → 400). */
export class UpdateProfessionalProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  headline?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  bio?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 70 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(70)
  yearsExperience?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  serviceIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  zoneIds?: string[];
}

export class AvailabilityDto {
  @ApiProperty({ description: 'true = "Disponible hoy" (vence a medianoche, hora de Argentina)' })
  @IsBoolean()
  availableToday: boolean;
}

export class RequestVerificationDto {
  @ApiProperty({ enum: VerificationType })
  @IsEnum(VerificationType)
  type: VerificationType;

  @ApiPropertyOptional({ description: 'Para LICENSE: servicio al que corresponde la matrícula' })
  @IsOptional()
  @IsUUID()
  serviceId?: string;

  @ApiPropertyOptional({ example: 'Mat. N.º 4.218' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;
}
