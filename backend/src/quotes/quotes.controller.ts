import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { CurrentProfessional, ProfessionalGuard } from '../common/auth/professional.guard';
import { ProfessionalProfile } from '../professionals/professional-profile.entity';
import { CreateQuoteDto, UpdateQuoteDto } from './dto/quote.dto';
import { QuotesService } from './quotes.service';

@ApiTags('quotes')
@ApiBearerAuth()
@Controller('quotes')
export class QuotesController {
  constructor(private readonly quotes: QuotesService) {}

  @Post(':id/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: 'Devuelve la solicitud actualizada (PROFESSIONAL_SELECTED).' })
  @ApiNotFoundResponse({ description: 'El presupuesto no existe o no es de una solicitud tuya' })
  @ApiConflictResponse({ description: 'INVALID_QUOTE_STATE | INVALID_REQUEST_STATE | QUOTE_EXPIRED' })
  accept(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.quotes.accept(user.userId, id);
  }
}

@ApiTags('pro')
@ApiBearerAuth()
@UseGuards(ProfessionalGuard)
@Controller('pro')
export class ProQuotesController {
  constructor(private readonly quotes: QuotesService) {}

  @Post('requests/:id/quote')
  @ApiForbiddenResponse({ description: 'NOT_INVITED | PLAN_LIMIT_REACHED' })
  @ApiConflictResponse({
    description: 'QUOTE_ALREADY_EXISTS (usar PATCH /pro/quotes/:id) | INVALID_REQUEST_STATE',
  })
  create(
    @CurrentProfessional() pro: ProfessionalProfile,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateQuoteDto,
  ) {
    return this.quotes.create(pro, id, dto);
  }

  @Patch('quotes/:id')
  @ApiOkResponse({ description: 'Reemplaza descripción, montos e ítems. El total se recalcula.' })
  update(
    @CurrentProfessional() pro: ProfessionalProfile,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateQuoteDto,
  ) {
    return this.quotes.update(pro, id, dto);
  }

  @Post('quotes/:id/withdraw')
  @HttpCode(HttpStatus.OK)
  withdraw(@CurrentProfessional() pro: ProfessionalProfile, @Param('id', ParseUUIDPipe) id: string) {
    return this.quotes.withdraw(pro, id);
  }
}
