import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiNotFoundResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { DataSource } from 'typeorm';
import type { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { AppException } from '../common/errors/app-exception';
import { ThrottleWrite } from '../common/throttle';
import { answerContactFollowup, type ContactFollowupAnswer, pendingContactFollowups } from './contact-followups';

export class ContactFollowupAnswerDto {
  @IsIn(['HIRED', 'NOT_HIRED'])
  answer: ContactFollowupAnswer;
}

/** «¿Lo contrataste?» del cliente: privado, nunca lo ve el profesional. */
@ApiTags('contact-followups')
@ApiBearerAuth()
@Controller('me/contact-followups')
export class ContactFollowupsController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  @Get()
  @ApiOkResponse({ description: '{ items: [{ professionalId, name, headline, avatarUrl, channel, contactedAt }] }' })
  async list(@CurrentUser() user: AuthUser) {
    return { items: await pendingContactFollowups(this.dataSource, user.userId, this.config) };
  }

  @ThrottleWrite()
  @Post(':professionalId/answer')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: '{ answered: true }' })
  @ApiNotFoundResponse({ description: 'No había una pregunta pendiente para ese profesional' })
  async answer(
    @CurrentUser() user: AuthUser,
    @Param('professionalId', ParseUUIDPipe) professionalId: string,
    @Body() dto: ContactFollowupAnswerDto,
  ) {
    if (!(await answerContactFollowup(this.dataSource, user.userId, professionalId, dto.answer)))
      throw AppException.notFound('Pregunta');
    return { answered: true };
  }
}
