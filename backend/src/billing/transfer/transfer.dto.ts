import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
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
