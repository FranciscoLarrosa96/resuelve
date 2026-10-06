import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { ThrottleCreate } from '../common/throttle';
import { Public } from '../common/auth/public.decorator';
import { CreateReviewDto, GuestReviewDto } from './dto/review.dto';
import { InvitedReviewsService } from './invited-reviews.service';

/** Reseña de alguien que NO contrató por Resuelve (QR o enlace del profesional): con cuenta o solo con nombre y correo. */
@ApiTags('reviews')
@ApiBearerAuth()
@Controller('professionals')
export class InvitedReviewsController {
  constructor(private readonly invited: InvitedReviewsService) {}

  @Get(':id/invited-review')
  @ApiOkResponse({ description: '{ canReview, blocker, requestId, review }: si puede reseñar o por qué no' })
  status(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.invited.status(user.userId, id);
  }

  @ThrottleCreate()
  @Post(':id/invited-review')
  @ApiCreatedResponse({
    description: 'Reseña por invitación: se muestra aparte y no cambia el rating ni el orden de la búsqueda.',
  })
  @ApiConflictResponse({ description: 'REVIEW_NOT_ALLOWED | REVIEW_ALREADY_EXISTS (details.blocker)' })
  create(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateReviewDto,
  ) {
    return this.invited.create(user.userId, id, dto);
  }

  /** Sin cuenta: nombre de pila y correo (privado). Una por correo y profesional. */
  @Public()
  @ThrottleCreate()
  @Post(':id/guest-review')
  @ApiCreatedResponse({
    description: 'Reseña por invitación sin cuenta: se muestra aparte y no cambia el rating ni el orden.',
  })
  @ApiConflictResponse({ description: 'REVIEW_NOT_ALLOWED | REVIEW_ALREADY_EXISTS (details.blocker)' })
  createAsGuest(@Param('id', ParseUUIDPipe) id: string, @Body() dto: GuestReviewDto) {
    return this.invited.createAsGuest(id, dto);
  }
}
