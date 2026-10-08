import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, Max, Min, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class AdminVerificationsQueryDto {
  @ApiPropertyOptional({ enum: ['pending', 'reviewed'], default: 'pending' })
  @IsOptional()
  @IsIn(['pending', 'reviewed'])
  status?: 'pending' | 'reviewed';
}

export class ApproveVerificationDto {
  @ApiPropertyOptional({
    example: '2027-12-31',
    description: 'Vencimiento que figura en el registro oficial, si tiene',
  })
  @IsOptional()
  @IsDateString({ strict: true })
  expiresAt?: string;
}

export class RejectVerificationDto {
  @ApiProperty({
    example: 'El número no figura en el registro de Camuzzi.',
    description: 'Lo lee el profesional tal cual',
  })
  @IsString()
  @MinLength(5)
  @MaxLength(300)
  reason: string;
}

export class AdminReportsQueryDto {
  @ApiPropertyOptional({ enum: ['open', 'resolved'], default: 'open' })
  @IsOptional()
  @IsIn(['open', 'resolved'])
  status?: 'open' | 'resolved';
}

export class HideReviewDto {
  @ApiProperty({ example: 'Lenguaje ofensivo.', description: 'Motivo interno; no lo ve el cliente' })
  @IsString()
  @MinLength(5)
  @MaxLength(300)
  reason: string;
}

/** `min` = lo mínimo que cobra Mercado Pago; con la oferta de bienvenida el piso real es `minProMonthlyPrice`. */
export const PRO_PRICE_LIMITS = { min: 15, max: 10_000_000 } as const;

export class SetProPriceDto {
  @ApiProperty({ example: 15000, description: 'Pesos por mes, entero. Rige solo para suscripciones nuevas' })
  @IsInt()
  @Min(PRO_PRICE_LIMITS.min)
  @Max(PRO_PRICE_LIMITS.max)
  monthlyPriceArs: number;
}

export const ADMIN_USER_KINDS = ['active', 'professionals', 'clients', 'admins', 'deleted'] as const;
export type AdminUserKind = (typeof ADMIN_USER_KINDS)[number];

export class AdminUsersQueryDto {
  @ApiPropertyOptional({ description: 'Busca en email, nombre y apellido', example: 'prueba' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ enum: ADMIN_USER_KINDS, default: 'active' })
  @IsOptional()
  @IsIn(ADMIN_USER_KINDS)
  kind?: AdminUserKind;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000)
  page?: number;
}

export class GrantProDto {
  @ApiPropertyOptional({ example: 30, description: 'Días de PRO desde hoy (1–3650). Sin días = sin vencimiento' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3650)
  days?: number;
}

export class PurgeUserDto {
  @ApiProperty({ description: 'El email actual de la cuenta, escrito a mano para confirmar' })
  @IsString()
  @MaxLength(254)
  confirmEmail: string;
}
