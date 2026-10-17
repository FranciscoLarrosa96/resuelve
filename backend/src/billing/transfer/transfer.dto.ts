import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { PlanTier } from '../../professionals/professional.enums';
import { TransferPaymentStatus } from './transfer-payment.entity';
import { ALIAS_PATTERN, TRANSFER_PERIODS, isValidCbu, isValidRefundDestination } from './transfer-rules';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const emptyToUndefined = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || undefined : value;

@ValidatorConstraint({ name: 'cbu' })
class CbuConstraint implements ValidatorConstraintInterface {
  validate(value: unknown) {
    return value === undefined || value === null || (typeof value === 'string' && isValidCbu(value));
  }
  defaultMessage() {
    return 'El CBU/CVU tiene que tener 22 dígitos válidos';
  }
}

@ValidatorConstraint({ name: 'refundDestination' })
class RefundDestinationConstraint implements ValidatorConstraintInterface {
  validate(value: unknown) {
    return typeof value === 'string' && isValidRefundDestination(value);
  }
  defaultMessage() {
    return 'Ingresá un alias (6 a 20 caracteres) o un CBU/CVU de 22 dígitos';
  }
}

/** El monto nunca viaja desde el frontend: lo decide el backend según el período. */
export class TransferRequestDto {
  @ApiPropertyOptional({ enum: [PlanTier.PRO, PlanTier.PRO_PLUS] })
  @IsOptional()
  @IsIn([PlanTier.PRO, PlanTier.PRO_PLUS])
  plan?: PlanTier.PRO | PlanTier.PRO_PLUS;

  @ApiProperty({ enum: TRANSFER_PERIODS, description: 'Meses de PRO a pagar por adelantado (de 30 días)' })
  @Type(() => Number)
  @IsInt()
  @IsIn([...TRANSFER_PERIODS])
  months: number;
}

export class TransferSubmitDto {
  @ApiPropertyOptional({ description: 'publicId del comprobante subido con el ticket (opcional)' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  proofPublicId?: string;
}

export class TransferWithdrawDto {
  @ApiProperty({ example: 'mi.alias.mp', description: 'Alias o CBU/CVU donde devolver lo pagado' })
  @Transform(trim)
  @IsString()
  @Validate(RefundDestinationConstraint)
  refundTo: string;

  @ApiPropertyOptional({ description: 'Pago sobre el que se pide el arrepentimiento (sin esto, el último confirmado)' })
  @IsOptional()
  @IsUUID()
  paymentId?: string;
}

export class AdminTransfersQueryDto {
  @ApiPropertyOptional({ enum: TransferPaymentStatus })
  @IsOptional()
  @IsEnum(TransferPaymentStatus)
  status?: TransferPaymentStatus;
}

export class AdminTransferApproveDto {
  @ApiPropertyOptional({ description: 'Nota interna (no la ve el profesional)' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class AdminTransferRejectDto {
  @ApiProperty({ example: 'No encontramos una transferencia con ese código.', description: 'Lo lee el profesional tal cual' })
  @Transform(trim)
  @IsString()
  @MinLength(5)
  @MaxLength(300)
  reason: string;
}

/** Pago recibido por fuera del flujo: el monto es el que realmente llegó. */
export class AdminTransferRecordDto {
  @ApiPropertyOptional({ enum: [PlanTier.PRO, PlanTier.PRO_PLUS] })
  @IsOptional()
  @IsIn([PlanTier.PRO, PlanTier.PRO_PLUS])
  plan?: PlanTier.PRO | PlanTier.PRO_PLUS;

  @ApiProperty({ enum: TRANSFER_PERIODS })
  @Type(() => Number)
  @IsInt()
  @IsIn([...TRANSFER_PERIODS])
  months: number;

  @ApiProperty({ example: 15000 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000_000)
  amountArs: number;

  @ApiPropertyOptional({ description: 'Nota interna (por ejemplo, el banco o la fecha de la transferencia)' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

/** Datos bancarios que ven los profesionales para transferir. */
export class TransferAccountDto {
  @ApiProperty()
  @IsBoolean()
  enabled: boolean;

  @ApiProperty({ example: 'Francisco Larrosa' })
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(80)
  holder: string;

  @ApiProperty({ example: 'resuelve.pro' })
  @Transform(trim)
  @IsString()
  @Matches(ALIAS_PATTERN, { message: 'El alias tiene entre 6 y 20 caracteres: letras, números, punto o guion' })
  alias: string;

  @ApiPropertyOptional({ example: '2850590940090418135201' })
  @Transform(emptyToUndefined)
  @IsOptional()
  @Validate(CbuConstraint)
  cbu?: string;

  @ApiPropertyOptional({ example: 'Banco Nación' })
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(60)
  bank?: string;

  @ApiPropertyOptional({ example: '20-39550730-4' })
  @Transform(emptyToUndefined)
  @IsOptional()
  @Matches(/^\d{2}-?\d{8}-?\d$/, { message: 'El CUIT tiene 11 dígitos (con o sin guiones)' })
  cuit?: string;
}

const REFERENCE_FORMAT = /^RES-[A-Za-z0-9]{6}$/;

/** Solicitud de arrepentimiento sin sesión: datos mínimos para localizar el pago y contactar a la persona. */
export class WithdrawalContactRequestDto {
  @ApiProperty({ example: 'Ana Pérez' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @ApiProperty({ example: 'ana@example.com' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiPropertyOptional({ example: '+54 9 249 400 0000' })
  @Transform(emptyToUndefined)
  @IsOptional()
  @Matches(/^[0-9+()\s-]{6,30}$/, { message: 'El teléfono no es válido' })
  phone?: string;

  @ApiPropertyOptional({ example: 'RES-ABC234', description: 'Código del pago, si lo tiene' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() || undefined : value))
  @IsOptional()
  @Matches(REFERENCE_FORMAT, { message: 'El código del pago tiene el formato RES-XXXXXX' })
  paymentReference?: string;

  @ApiPropertyOptional({ description: 'Lo que recuerda del pago: fecha, monto o plan' })
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @ApiProperty({ description: 'Acepta que usemos estos datos para verificar su identidad y contactarla' })
  @IsBoolean()
  consent: boolean;
}

export class AdminWithdrawalRequestsQueryDto {
  @ApiPropertyOptional({ enum: ['PENDING', 'LINKED', 'RESOLVED', 'DISMISSED'] })
  @IsOptional()
  @IsIn(['PENDING', 'LINKED', 'RESOLVED', 'DISMISSED'])
  status?: string;
}

export class AdminWithdrawalLinkDto {
  @ApiProperty({ example: 'RES-ABC234', description: 'Código del pago al que se vincula (identidad ya verificada)' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @Matches(REFERENCE_FORMAT, { message: 'El código del pago tiene el formato RES-XXXXXX' })
  reference: string;

  @ApiProperty({ example: 'mi.alias.mp', description: 'Alias o CBU/CVU que indicó la persona para la devolución' })
  @Transform(trim)
  @IsString()
  @Validate(RefundDestinationConstraint)
  refundTo: string;
}

export class AdminWithdrawalDismissDto {
  @ApiProperty({ description: 'Motivo interno' })
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  note: string;
}
