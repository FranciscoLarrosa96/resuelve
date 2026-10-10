import { ApiProperty, ApiPropertyOptional, type ApiPropertyOptions } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/pagination';
import { MAX_COVERAGE_LOCALITIES } from '../professional-rules';
import { ProfessionalStatus, VerificationType } from '../professional.enums';

const toBool = ({ value }: { value: unknown }) =>
  value === 'true' || value === true ? true : value === 'false' || value === false ? false : value;

export class SearchProfessionalsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Servicio: id o slug (ej. plomeria)' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  service?: string;

  @ApiPropertyOptional({
    description:
      'Localidad (id). Solo profesionales que la cubren; los destacados también son de esa localidad. Sin localidad: búsqueda legacy sin filtro geográfico.',
  })
  @IsOptional()
  @IsUUID()
  locality?: string;

  @ApiPropertyOptional({ description: 'Barrio: id o slug (ej. villa-italia). Con slug, conviene mandar `locality`.' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  zone?: string;

  @ApiPropertyOptional({ description: 'Solo quienes toman urgencias ahora ("Tomo urgencias")' })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  availableToday?: boolean;

  @ApiPropertyOptional({ description: 'Solo con matrícula verificada' })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  licenseVerified?: boolean;

  @ApiPropertyOptional({
    description:
      'Solo perfiles con Resuelve PRO vigente (vitrina del inicio). Rota por día y nunca marca "Destacado".',
  })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  pro?: boolean;

  @ApiPropertyOptional({ minimum: 0, maximum: 5, example: 4.5 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(5)
  minRating?: number;
}


/** Una localidad donde trabaja: toda la ciudad o algunos de sus barrios. */
export class CoverageLocalityDto {
  @ApiProperty({ description: 'id de la localidad (GET /localities)' })
  @IsUUID()
  localityId: string;

  @ApiProperty({ description: 'true = toda la localidad (obligatorio si no tiene barrios cargados)' })
  @IsBoolean()
  coversEntireCity: boolean;

  @ApiPropertyOptional({ type: [String], description: 'Barrios de ESTA localidad (se conservan aunque cubra toda la ciudad)' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(60)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  zoneIds?: string[];
}

const COVERAGE_DOC: ApiPropertyOptions = {
  type: [CoverageLocalityDto],
  description: `Localidades donde trabaja (1–${MAX_COVERAGE_LOCALITIES}); reemplaza toda la cobertura. Un solo perfil para todas.`,
};

export class CreateProfessionalProfileDto {
  @ApiProperty({ example: 'Electricista matriculado' })
  @IsString()
  @Matches(/\S/, { message: 'El título debe contener texto' })
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

  @ApiPropertyOptional({ description: 'Ciudad principal (una de `coverage`). Por defecto, la primera.' })
  @IsOptional()
  @IsUUID()
  primaryLocalityId?: string;

  @ApiPropertyOptional(COVERAGE_DOC)
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_COVERAGE_LOCALITIES)
  @ValidateNested({ each: true })
  @Type(() => CoverageLocalityDto)
  coverage?: CoverageLocalityDto[];

  @ApiPropertyOptional({ description: 'LEGACY (sin `coverage`): toda la ciudad principal' })
  @IsOptional()
  @IsBoolean()
  coversEntireCity?: boolean;

  @ApiPropertyOptional({
    type: [String],
    description: 'LEGACY (sin `coverage`): barrios de la ciudad principal. Obligatorio (≥ 1) salvo con coversEntireCity',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  zoneIds?: string[];

  @ApiPropertyOptional({ description: '"Tomo urgencias" al publicar; vence a las 12 h' })
  @IsOptional()
  @IsBoolean()
  availableToday?: boolean;
}

/** Métricas, plan y verificaciones NO se aceptan acá (forbidNonWhitelisted → 400). */
export class UpdateProfessionalProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/\S/, { message: 'El título debe contener texto' })
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

  @ApiPropertyOptional({ description: 'Ciudad principal (una de `coverage`). Por defecto, la primera.' })
  @IsOptional()
  @IsUUID()
  primaryLocalityId?: string;

  @ApiPropertyOptional(COVERAGE_DOC)
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_COVERAGE_LOCALITIES)
  @ValidateNested({ each: true })
  @Type(() => CoverageLocalityDto)
  coverage?: CoverageLocalityDto[];

  @ApiPropertyOptional({ type: [String], description: 'LEGACY (sin `coverage`): reemplaza los barrios de esa ciudad' })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  zoneIds?: string[];

  @ApiPropertyOptional({
    description:
      'LEGACY (sin `coverage`): toda la ciudad principal. Los barrios guardados se conservan (y se ignoran) para poder volver',
  })
  @IsOptional()
  @IsBoolean()
  coversEntireCity?: boolean;
}

export class ProfileStatusDto {
  @ApiProperty({ enum: ProfessionalStatus, description: 'PAUSED = oculto en búsquedas y ficha pública' })
  @IsEnum(ProfessionalStatus)
  status: ProfessionalStatus;
}

export class AvailabilityDto {
  @ApiProperty({ description: 'true = "Tomo urgencias" por 12 h desde ahora (volver a mandarlo lo extiende); false = apagarlo' })
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

  @ApiPropertyOptional({
    example: 'Mat. N.º 4.218',
    description: 'Para LICENSE es obligatorio: número o referencia de matrícula',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;

  @ApiPropertyOptional({
    description: 'Para LICENSE, opcional: publicId del documento de respaldo (upload firmado)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  documentPublicId?: string;

  @ApiPropertyOptional({ example: '2027-12-31', description: 'Vencimiento de la matrícula, si tiene' })
  @IsOptional()
  @IsDateString({ strict: true })
  expiresAt?: string;
}

export class UploadTicketDto {
  @ApiProperty({ description: 'Servicio (con requiresLicense) cuya matrícula se va a respaldar' })
  @IsUUID()
  serviceId: string;
}

export class SetAvatarDto {
  @ApiProperty({ description: 'publicId que devolvió la firma de subida (resuelve/avatars/<id>/…)' })
  @IsString()
  @MaxLength(255)
  @Matches(/^resuelve\/avatars\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/)
  publicId: string;
}
