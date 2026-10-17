import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { PlanTier } from '../../professionals/professional.enums';

/** El monto nunca viaja desde el frontend: lo decide el backend. Solo PRO → PRO Plus. */
export class PlanChangeDto {
  @ApiPropertyOptional({ enum: [PlanTier.PRO_PLUS], default: PlanTier.PRO_PLUS })
  @IsOptional()
  @IsIn([PlanTier.PRO_PLUS])
  plan?: PlanTier.PRO_PLUS;
}
