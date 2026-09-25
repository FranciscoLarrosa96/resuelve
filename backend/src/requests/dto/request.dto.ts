import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/pagination';
import { MAX_INVITATIONS_PER_REQUEST, RequestStatus, RequestUrgency } from '../request.enums';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const MAX_PHOTOS = 6;

export class CreateRequestDto {
  @ApiProperty({ description: 'id del servicio (GET /services)' })
  @IsUUID()
  serviceId: string;

  @ApiProperty({ description: 'id de la zona/barrio (GET /zones)' })
  @IsUUID()
  zoneId: string;

  @ApiProperty({ example: 'Pérdida bajo mesada' })
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(140)
  title: string;

  @ApiProperty({ example: 'Tengo una pérdida abajo de la pileta de la cocina.' })
  @Transform(trim)
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  description: string;

  @ApiPropertyOptional({ enum: RequestUrgency, default: RequestUrgency.FLEXIBLE })
  @IsOptional()
  @IsEnum(RequestUrgency)
  urgency?: RequestUrgency;

  @ApiPropertyOptional({ example: '2026-09-25', description: 'Fecha deseada (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString({ strict: true })
  desiredDate?: string;

  @ApiPropertyOptional({ example: 'después de las 16' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  desiredTimeRange?: string;

  @ApiPropertyOptional({ description: 'Privada: solo la ve el profesional elegido', example: 'Alem 455' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(240)
  exactAddress?: string;

  @ApiPropertyOptional({ type: [String], description: `URLs https de fotos (máx. ${MAX_PHOTOS})` })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_PHOTOS)
  @IsUrl({ protocols: ['https'], require_protocol: true }, { each: true })
  photoUrls?: string[];
}

export class UpdateRequestDto {
  @ApiPropertyOptional({ description: 'Solo en DRAFT' })
  @IsOptional()
  @IsUUID()
  serviceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  zoneId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(140)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ enum: RequestUrgency })
  @IsOptional()
  @IsEnum(RequestUrgency)
  urgency?: RequestUrgency;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString({ strict: true })
  desiredDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  desiredTimeRange?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(240)
  exactAddress?: string;

  @ApiPropertyOptional({ type: [String], description: 'Reemplaza todas las fotos' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_PHOTOS)
  @IsUrl({ protocols: ['https'], require_protocol: true }, { each: true })
  photoUrls?: string[];
}

export class InviteProfessionalsDto {
  @ApiProperty({
    type: [String],
    maxItems: MAX_INVITATIONS_PER_REQUEST,
    description: 'ids de ProfessionalProfile',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_INVITATIONS_PER_REQUEST)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  professionalIds: string[];
}

export class ListRequestsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: RequestStatus })
  @IsOptional()
  @IsEnum(RequestStatus)
  status?: RequestStatus;
}
