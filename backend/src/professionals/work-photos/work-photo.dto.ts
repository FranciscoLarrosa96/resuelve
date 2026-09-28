import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsOptional, IsString, IsUUID, Matches, MaxLength, ValidateIf } from 'class-validator';
import { MAX_WORK_PHOTOS } from './work-photo-rules';

/** La descripción se normaliza y se valida en `work-photo-rules.ts` (hasta 80 caracteres, sin teléfonos ni emails). */
const CAPTION_INPUT_MAX = 300;

export class AddWorkPhotoDto {
  @ApiProperty({ description: 'publicId que devolvió la firma (resuelve/professional-work/<id>/…)' })
  @IsString()
  @MaxLength(255)
  @Matches(/^resuelve\/professional-work\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/)
  publicId: string;

  @ApiPropertyOptional({ nullable: true, maxLength: 80, example: 'Baño completo en porcelanato' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(CAPTION_INPUT_MAX)
  caption?: string | null;
}

export class UpdateWorkPhotoDto {
  @ApiProperty({ nullable: true, maxLength: 80, description: 'Vacío o null = sin descripción' })
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(CAPTION_INPUT_MAX)
  caption: string | null;
}

export class ReorderWorkPhotosDto {
  @ApiProperty({ type: [String], description: 'Todas las fotos del perfil, en el orden nuevo' })
  @IsArray()
  @ArrayMaxSize(MAX_WORK_PHOTOS)
  @IsUUID('all', { each: true })
  ids: string[];
}
