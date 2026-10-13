import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Put, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CurrentProfessional, ProfessionalGuard } from '../common/auth/professional.guard';
import { ThrottleWrite } from '../common/throttle';
import { ProfessionalProfile } from '../professionals/professional-profile.entity';
import { MAX_REVIEW_REPLY_LENGTH } from './review-reply';
import { ReviewRepliesService } from './review-replies.service';

export class ReviewReplyDto {
  @ApiProperty({ example: '¡Gracias, Mariana! Fue un gusto trabajar en tu casa.' })
  @IsString()
  @MaxLength(MAX_REVIEW_REPLY_LENGTH + 50)
  text: string;
}

export class OwnReviewsQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  page?: number;
}

/** Reseñas del profesional logueado y su respuesta pública (una por reseña). */
@ApiTags('pro')
@ApiBearerAuth()
@UseGuards(ProfessionalGuard)
@Controller('pro/reviews')
export class ReviewRepliesController {
  constructor(private readonly replies: ReviewRepliesService) {}

  @Get()
  @ApiOkResponse({ description: '{ items: [reseña pública con `reply`], page, pageSize, total }' })
  list(@CurrentProfessional() profile: ProfessionalProfile, @Query() q: OwnReviewsQueryDto) {
    return this.replies.listOwn(profile, q.page ?? 1);
  }

  @ThrottleWrite()
  @Put(':id/reply')
  @ApiOkResponse({ description: 'La reseña con su respuesta' })
  @ApiNotFoundResponse({ description: 'No existe, es de otro perfil o está oculta' })
  @ApiUnprocessableEntityResponse({ description: 'INVALID_REVIEW_REPLY (vacía, larga, con teléfono o email)' })
  reply(
    @CurrentProfessional() profile: ProfessionalProfile,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewReplyDto,
  ) {
    return this.replies.reply(profile, id, dto.text);
  }

  @Delete(':id/reply')
  @ApiOkResponse({ description: 'La reseña sin respuesta' })
  @ApiNotFoundResponse({ description: 'No existe, es de otro perfil o está oculta' })
  removeReply(@CurrentProfessional() profile: ProfessionalProfile, @Param('id', ParseUUIDPipe) id: string) {
    return this.replies.removeReply(profile, id);
  }
}
