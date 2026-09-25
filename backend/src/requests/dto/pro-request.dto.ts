import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/pagination';
import { InvitationStatus } from '../request.enums';

export class ProRequestsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: InvitationStatus,
    description: 'PENDING = "Nuevas", QUOTED = "Presupuestadas", SELECTED = "Aceptadas"',
  })
  @IsOptional()
  @IsEnum(InvitationStatus)
  status?: InvitationStatus;
}
