import { ApiPropertyOptional } from '@nestjs/swagger';
import { PlanTier } from '../../professionals/professional.enums';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

/** El precio nunca viaja desde el frontend: lo decide el backend. */
export class BillingCheckoutDto {
  @ApiPropertyOptional({ enum: [PlanTier.PRO, PlanTier.PRO_PLUS], default: PlanTier.PRO })
  @IsOptional()
  @IsIn([PlanTier.PRO, PlanTier.PRO_PLUS])
  plan?: PlanTier.PRO | PlanTier.PRO_PLUS;

  @ApiPropertyOptional({
    description: 'Ruta interna a la que volver después de activar (p. ej. /pro/solicitudes/<id>). Otra cosa se ignora.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  returnTo?: string;
}
