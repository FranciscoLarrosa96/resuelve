import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/pagination';

/** `verified` = trabajos hechos por Resuelve (default); `invited` = clientes que el profesional invitó. */
export type ReviewKind = 'verified' | 'invited';

export class ReviewsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ['verified', 'invited'], default: 'verified' })
  @IsOptional()
  @IsIn(['verified', 'invited'])
  kind: ReviewKind = 'verified';
}
