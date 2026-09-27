import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/** El precio nunca viaja desde el frontend: lo decide el backend. */
export class BillingCheckoutDto {
  @ApiPropertyOptional({
    description: 'Ruta interna a la que volver después de activar (p. ej. /pro/solicitudes/<id>). Otra cosa se ignora.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  returnTo?: string;
}
