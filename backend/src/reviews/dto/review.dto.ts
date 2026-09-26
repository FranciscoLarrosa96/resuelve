import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

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
