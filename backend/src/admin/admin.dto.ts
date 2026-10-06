import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

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
