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
  IsIn,
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

/** Órdenes del listado público. Ninguno se compra: PRO solo suma los espacios Destacados rotulados. */
export const PROFESSIONAL_SORTS = ['recommended', 'rating', 'reviews', 'response', 'organic'] as const;
export type ProfessionalSort = (typeof PROFESSIONAL_SORTS)[number];

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

  @ApiPropertyOptional({
    description: 'Barrio: id o slug (ej. villa-italia). Con slug, conviene mandar `locality`.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  zone?: string;

  @ApiPropertyOptional({ description: 'Solo quienes atienden urgencias ("Atiendo urgencias")' })
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

  @ApiPropertyOptional({
    enum: PROFESSIONAL_SORTS,
    description:
      'Orden: recomendados (default), rating, reviews o response con espacios Destacados rotulados. organic conserva el orden recomendado sin espacios promocionados, para sugerencias.',
  })
  @IsOptional()
  @IsIn(PROFESSIONAL_SORTS)
  sort?: ProfessionalSort;
}

/** Una localidad donde trabaja: toda la ciudad o algunos de sus barrios. */
export class CoverageLocalityDto {
  @ApiProperty({ description: 'id de la localidad (GET /localities)' })
  @IsUUID()
  localityId: string;

  @ApiProperty({ description: 'true = toda la localidad (obligatorio si no tiene barrios cargados)' })
  @IsBoolean()
  coversEntireCity: boolean;

  @ApiPropertyOptional({
    type: [String],
    description: 'Barrios de ESTA localidad (se conservan aunque cubra toda la ciudad)',
  })
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

export class ServiceSpecialtiesDto {
  @ApiProperty()
  @IsUUID()
  serviceId: string;

  @ApiProperty({
    type: [String],
    description: 'Hasta 5 especialidades propias, no nuevos rubros del catálogo',
  })
  @IsArray()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  names: string[];
}

export class CreateProfessionalProfileDto {
  @ApiPropertyOptional({ type: [ServiceSpecialtiesDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => ServiceSpecialtiesDto)
  specialties?: ServiceSpecialtiesDto[];

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

  @ApiPropertyOptional({ minimum: 0, maximum: 70, nullable: true, description: 'Sin dato = no informado' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(70)
  yearsExperience?: number | null;

  @ApiProperty({ type: [String], description: 'ids de servicios que ofrece (vacío solo con un oficio sugerido pendiente)' })
  @IsArray()
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
    description:
      'LEGACY (sin `coverage`): barrios de la ciudad principal. Obligatorio (≥ 1) salvo con coversEntireCity',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  zoneIds?: string[];

  @ApiPropertyOptional({ description: '"Atiendo urgencias" al publicar (permanente hasta que lo apague)' })
  @IsOptional()
  @IsBoolean()
  availableToday?: boolean;
}

/** Métricas, plan y verificaciones NO se aceptan acá (forbidNonWhitelisted → 400). */
export class UpdateProfessionalProfileDto {
  @ApiPropertyOptional({ type: [ServiceSpecialtiesDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => ServiceSpecialtiesDto)
  specialties?: ServiceSpecialtiesDto[];

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

  @ApiPropertyOptional({ minimum: 0, maximum: 70, nullable: true, description: 'null = borrar el dato (no informado)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(70)
  yearsExperience?: number | null;

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

  @ApiPropertyOptional({
    type: [String],
    description: 'LEGACY (sin `coverage`): reemplaza los barrios de esa ciudad',
  })
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
  @ApiProperty({ description: 'true = "Atiendo urgencias" (permanente, no vence); false = apagarlo' })
  @IsBoolean()
  availableToday: boolean;
}

/**
 * PATCH /pro/contact: reemplaza la configuración de contacto completa. Los números se
 * normalizan y validan en el servidor (`contact/phone.ts`); el límite de 32 caracteres
 * es solo de entrada (con espacios, guiones y paréntesis).
 */
export class ContactSettingsDto {
  @ApiProperty({ description: 'WhatsApp habilitado (exige whatsappNumber y consent)' })
  @IsBoolean()
  whatsappEnabled: boolean;

  @ApiProperty({ description: 'Llamadas habilitadas (exige phoneNumber y consent)' })
  @IsBoolean()
  callsEnabled: boolean;

  @ApiProperty({ description: 'Solicitudes y presupuestos por Resuelve' })
  @IsBoolean()
  requestsEnabled: boolean;

  @ApiPropertyOptional({
    example: '249 15 412-3456',
    description: 'Celular de WhatsApp (argentino o internacional con +)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  whatsappNumber?: string | null;

  @ApiPropertyOptional({ example: '249 442-3456', description: 'Teléfono para llamadas' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phoneNumber?: string | null;

  @ApiPropertyOptional({
    enum: ['MOBILE', 'LANDLINE'],
    description:
      'Si el número de llamadas argentino no aclara (sin 9 ni 15): celular o fijo. Por defecto celular.',
  })
  @IsOptional()
  @IsEnum(['MOBILE', 'LANDLINE'])
  phoneKind?: 'MOBILE' | 'LANDLINE';

  @ApiProperty({
    description:
      'Acepta que sus números de contacto se muestren a otros usuarios. false = retira el consentimiento: se apagan WhatsApp y llamadas y se borran los números.',
  })
  @IsBoolean()
  consent: boolean;
}

/** POST /professionals/:id/contact: pedir el número de un canal directo (cuenta como clic). */
export class ContactRevealDto {
  @ApiProperty({ enum: ['WHATSAPP', 'PHONE'] })
  @IsEnum(['WHATSAPP', 'PHONE'])
  channel: 'WHATSAPP' | 'PHONE';

  @ApiPropertyOptional({
    description: 'Clave anónima de la sesión del navegador (la misma de /analytics/events)',
  })
  @IsOptional()
  @Matches(/^[A-Za-z0-9_-]{16,64}$/)
  sessionKey?: string;
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

export class SetCoverDto {
  @ApiProperty({ description: 'publicId que devolvió la firma de subida (resuelve/covers/<id>/…)' })
  @IsString()
  @MaxLength(255)
  @Matches(/^resuelve\/covers\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/)
  publicId: string;
}

export class SetAvatarDto {
  @ApiProperty({ description: 'publicId que devolvió la firma de subida (resuelve/avatars/<id>/…)' })
  @IsString()
  @MaxLength(255)
  @Matches(/^resuelve\/avatars\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/)
  publicId: string;
}
