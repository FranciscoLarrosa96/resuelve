import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiProperty,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { CurrentProfessional, ProfessionalGuard } from '../../common/auth/professional.guard';
import { ThrottleWrite } from '../../common/throttle';
import { ProfessionalProfile } from '../../professionals/professional-profile.entity';
import { MAX_QUESTION_LENGTH } from './request-question-rules';
import { RequestQuestionsService } from './request-questions.service';

export class QuestionTextDto {
  @ApiProperty({ example: '¿Me podés mandar una foto de la pérdida?' })
  @IsString()
  @MaxLength(MAX_QUESTION_LENGTH + 50)
  text: string;
}

/** El profesional invitado consulta antes de presupuestar. */
@ApiTags('pro')
@ApiBearerAuth()
@UseGuards(ProfessionalGuard)
@Controller('pro/requests')
export class ProRequestQuestionsController {
  constructor(private readonly questions: RequestQuestionsService) {}

  @Get(':id/questions')
  @ApiOkResponse({ description: '{ items: [{ id, question, answer, askedAt, answeredAt }], canAsk, max }' })
  @ApiNotFoundResponse({ description: 'No fue invitado a esta solicitud' })
  list(@CurrentProfessional() pro: ProfessionalProfile, @Param('id', ParseUUIDPipe) id: string) {
    return this.questions.listForProfessional(pro, id);
  }

  @ThrottleWrite()
  @Post(':id/questions')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: 'La lista actualizada' })
  @ApiConflictResponse({ description: 'QUESTION_NOT_ALLOWED | QUESTION_PENDING | QUESTIONS_LIMIT_REACHED' })
  @ApiUnprocessableEntityResponse({ description: 'INVALID_QUESTION (vacía, larga, con teléfono o email)' })
  ask(
    @CurrentProfessional() pro: ProfessionalProfile,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: QuestionTextDto,
  ) {
    return this.questions.ask(pro, id, dto.text);
  }
}

/** El cliente ve y responde las consultas de su solicitud. */
@ApiTags('requests')
@ApiBearerAuth()
@Controller('requests')
export class ClientRequestQuestionsController {
  constructor(private readonly questions: RequestQuestionsService) {}

  @Get(':id/questions')
  @ApiOkResponse({ description: '{ groups: [{ professional: { id, displayName }, items }], canAnswer }' })
  @ApiNotFoundResponse({ description: 'La solicitud no existe o no es tuya' })
  list(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.questions.listForClient(user.userId, id);
  }

  @ThrottleWrite()
  @Post(':id/questions/:questionId/answer')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: 'La lista actualizada' })
  @ApiConflictResponse({ description: 'QUESTION_ALREADY_ANSWERED | QUESTION_NOT_ALLOWED' })
  @ApiUnprocessableEntityResponse({ description: 'INVALID_QUESTION' })
  answer(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('questionId', ParseUUIDPipe) questionId: string,
    @Body() dto: QuestionTextDto,
  ) {
    return this.questions.answer(user.userId, id, questionId, dto.text);
  }
}
