import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class ScheduleJobDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  scheduledDate: string;

  @IsOptional()
  @IsString()
  @Matches(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
  scheduledTime?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1440)
  durationMinutes?: number;
}

export class JobNotesDto {
  @IsString()
  @MaxLength(2000)
  privateNotes: string;
}

export class JobChecklistItemDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  id?: string;

  @IsString()
  @MaxLength(160)
  text: string;

  @IsBoolean()
  done: boolean;
}

export class JobChecklistDto {
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => JobChecklistItemDto)
  items: JobChecklistItemDto[];
}
