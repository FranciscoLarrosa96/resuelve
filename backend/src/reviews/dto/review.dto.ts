import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** Texto plano: se rechaza cualquier cosa con forma de etiqueta HTML (`<b>`, `</p>`, `<!--`). "<3" pasa. */
export const NO_HTML = /^(?![\s\S]*<\s*[/!]?\s*[a-z])[\s\S]*$/i;

export class CreateReviewDto {
  @ApiProperty({ minimum: 1, maximum: 5, example: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiPropertyOptional({ example: 'Llegó puntual y explicó todo.', maxLength: 1000 })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(1000)
  @Matches(NO_HTML, { message: 'La reseña es texto plano: sin etiquetas HTML' })
  comment?: string;
}

/** Reseña por invitación de alguien SIN cuenta: nombre de pila y correo (privado, solo evita repetidas). */
export class GuestReviewDto extends CreateReviewDto {
  @ApiProperty({ example: 'Laura', maxLength: 60, description: 'Solo se publica el primer nombre' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  @Matches(NO_HTML, { message: 'El nombre es texto plano: sin etiquetas HTML' })
  name: string;

  @ApiProperty({ example: 'laura@correo.com' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  @MaxLength(254)
  email: string;
}

/** Reporte de una reseña pública. */
export class ReportReviewDto {
  @ApiProperty({ enum: ['FAKE', 'OFFENSIVE', 'SPAM', 'OTHER'], example: 'FAKE' })
  @IsIn(['FAKE', 'OFFENSIVE', 'SPAM', 'OTHER'])
  reason: 'FAKE' | 'OFFENSIVE' | 'SPAM' | 'OTHER';

  @ApiPropertyOptional({ maxLength: 500, example: 'Esta persona nunca trabajó conmigo.' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(500)
  @Matches(NO_HTML, { message: 'El detalle es texto plano: sin etiquetas HTML' })
  details?: string;
}
