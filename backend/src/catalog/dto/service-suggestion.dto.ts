import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsString, IsUUID, Length, Max, Min, ValidateIf } from 'class-validator';

const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : value;

export class SuggestServiceDto {
  @Transform(trim)
  @IsString()
  @Length(3, 80)
  name: string;
}

export class SuggestionQueryDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsIn(['PENDING', 'APPROVED', 'REJECTED'])
  status?: 'PENDING' | 'APPROVED' | 'REJECTED';

  @ValidateIf((_, value) => value !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  page?: number;
}

export class ApproveServiceDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsUUID()
  serviceId?: string;

  @ValidateIf((_, value) => value !== undefined)
  @Transform(trim)
  @IsString()
  @Length(3, 80)
  name?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsUUID()
  categoryId?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsBoolean()
  requiresLicense?: boolean;
}

export class RejectServiceDto {
  @Transform(trim)
  @IsString()
  @Length(3, 300)
  reason: string;
}
