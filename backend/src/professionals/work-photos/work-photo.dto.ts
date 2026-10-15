import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsBoolean, IsOptional, IsString, IsUUID, Matches, MaxLength, ValidateIf } from 'class-validator';
import { MAX_PHOTOS_IN_LEGACY_WORK } from './work-photo-rules';

/**
 * Los textos se normalizan y se validan en `work-photo-rules.ts` (largo, sin
 * teléfonos ni emails): acá solo un tope de entrada generoso.
 */
const TEXT_INPUT_MAX = 300;

export class CreateWorkDto {
  @ApiProperty({ maxLength: 60, example: 'Casa 1' })
  @IsString()
  @MaxLength(TEXT_INPUT_MAX)
  title: string;

  @ApiPropertyOptional({ nullable: true, maxLength: 160, example: 'Baño completo: cañerías nuevas y porcelanato' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(TEXT_INPUT_MAX)
  description?: string | null;

  @ApiProperty({ description: 'Mes y año del trabajo (no futuro)', example: '2026-03' })
  @IsString()
  @MaxLength(7)
  doneOn: string;
}

export class UpdateWorkDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  pinned?: boolean;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsUUID()
  beforePhotoId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsUUID()
  afterPhotoId?: string | null;

  @ApiPropertyOptional({ maxLength: 60 })
  @IsOptional()
  @IsString()
  @MaxLength(TEXT_INPUT_MAX)
  title?: string;

  @ApiPropertyOptional({ nullable: true, maxLength: 160, description: 'Vacío o null = sin descripción' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(TEXT_INPUT_MAX)
  description?: string | null;

  @ApiPropertyOptional({ example: '2026-03' })
  @IsOptional()
  @IsString()
  @MaxLength(7)
  doneOn?: string;
}

export class SignWorkPhotoDto {
  @ApiProperty({ description: 'Trabajo al que va la foto' })
  @IsUUID()
  workId: string;
}

export class AddWorkPhotoDto {
  @ApiProperty({ description: 'Trabajo al que va la foto' })
  @IsUUID()
  workId: string;

  @ApiProperty({ description: 'publicId que devolvió la firma (resuelve/professional-work/<id>/…)' })
  @IsString()
  @MaxLength(255)
  @Matches(/^resuelve\/professional-work\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/)
  publicId: string;

  @ApiPropertyOptional({ nullable: true, maxLength: 80, example: 'Antes de empezar' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(TEXT_INPUT_MAX)
  caption?: string | null;
}

export class UpdateWorkPhotoDto {
  @ApiProperty({ nullable: true, maxLength: 80, description: 'Vacío o null = sin descripción' })
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(TEXT_INPUT_MAX)
  caption: string | null;
}

export class MoveWorkPhotoDto {
  @ApiProperty({ description: 'Trabajo de destino (activo y con menos de 5 fotos)' })
  @IsUUID()
  workId: string;
}

export class ReorderWorkPhotosDto {
  @ApiProperty({ description: 'Trabajo cuyas fotos se reordenan' })
  @IsUUID()
  workId: string;

  @ApiProperty({ type: [String], description: 'Todas las fotos del trabajo, en el orden nuevo (la primera es la portada)' })
  @IsArray()
  @ArrayMaxSize(MAX_PHOTOS_IN_LEGACY_WORK)
  @IsUUID('all', { each: true })
  ids: string[];
}
