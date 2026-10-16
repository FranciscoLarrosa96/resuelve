import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Public } from '../common/auth/public.decorator';
import { CurrentProfessional, ProfessionalGuard } from '../common/auth/professional.guard';
import { ProfessionalProfile } from '../professionals/professional-profile.entity';
import { QuotesService } from '../quotes/quotes.service';
import { ProRequestsQueryDto } from './dto/pro-request.dto';
import {
  CreateRequestDto,
  InviteProfessionalsDto,
  ListRequestsQueryDto,
  RecipientCheckDto,
  UpdateRequestDto,
} from './dto/request.dto';
import { ProRequestsService } from './pro-requests.service';
import { InvitationOptionsService } from './invitation-options.service';
import { RequestsService } from './requests.service';
import { ThrottleCreate, ThrottleWrite } from '../common/throttle';

@ApiTags('requests')
@ApiBearerAuth()
@Controller('requests')
export class RequestsController {
  constructor(
    private readonly requests: RequestsService,
    private readonly quotes: QuotesService,
    private readonly invitations: InvitationOptionsService,
  ) {}

  @ThrottleCreate()
  @Post()
  @ApiCreatedResponse({
    description: 'Crea la solicitud en DRAFT. Pasa a WAITING_QUOTES al invitar profesionales.',
  })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateRequestDto) {
    return this.requests.create(user.userId, dto);
  }

  @Public()
  @ThrottleWrite()
  @Post('eligible-recipients')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    description:
      'Antes de enviar: de los profesionales indicados, los que pueden responder ese pedido ahora (misma regla que POST invitations). Solo ids. El envío revalida.',
  })
  eligibleRecipients(@Body() dto: RecipientCheckDto) {
    return this.invitations.eligibleRecipients(dto);
  }

  @Get('mine')
  @ApiOkResponse({ description: 'Paginado: { items, page, pageSize, total }' })
  mine(@CurrentUser() user: AuthUser, @Query() query: ListRequestsQueryDto) {
    return this.requests.listMine(user.userId, query);
  }

  @Get(':id')
  @ApiNotFoundResponse({ description: 'No existe o no es tuya' })
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.requests.getMine(user.userId, id);
  }

  @Patch(':id')
  @ApiConflictResponse({ description: 'INVALID_REQUEST_STATE' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRequestDto,
  ) {
    return this.requests.update(user.userId, id, dto);
  }

  @ThrottleWrite()
  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.requests.cancel(user.userId, id);
  }

  @ThrottleWrite()
  @Post(':id/invitations')
  @HttpCode(HttpStatus.OK)
  @ApiUnprocessableEntityResponse({
    description: 'INVITATION_LIMIT_REACHED | PROFESSIONAL_NOT_ELIGIBLE | CANNOT_INVITE_SELF',
  })
  invite(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: InviteProfessionalsDto,
  ) {
    return this.requests.invite(user.userId, id, dto);
  }

  @Get(':id/invitation-options')
  @ApiOkResponse({
    description:
      'Sumar profesionales: estado, lugares y recomendados que pueden responder (misma regla que POST invitations) y contacto directo.',
  })
  @ApiNotFoundResponse({ description: 'No existe o no es tuya' })
  invitationOptions(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.invitations.get(user.userId, id);
  }

  @Get(':id/quotes')
  @ApiOkResponse({ description: 'Presupuestos recibidos (ordenados por total).' })
  listQuotes(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.quotes.listForClient(user.userId, id);
  }
}

@ApiTags('pro')
@ApiBearerAuth()
@UseGuards(ProfessionalGuard)
@Controller('pro/requests')
export class ProRequestsController {
  constructor(private readonly requests: ProRequestsService) {}

  @Get()
  @ApiOkResponse({ description: 'Solicitudes recibidas. Sin dirección exacta salvo que te hayan elegido.' })
  list(@CurrentProfessional() pro: ProfessionalProfile, @Query() query: ProRequestsQueryDto) {
    return this.requests.list(pro, query);
  }

  @Get(':id')
  @ApiNotFoundResponse({ description: 'No te invitaron a esta solicitud' })
  get(@CurrentProfessional() pro: ProfessionalProfile, @Param('id', ParseUUIDPipe) id: string) {
    return this.requests.get(pro, id);
  }

  @Post(':id/decline')
  @HttpCode(HttpStatus.OK)
  decline(@CurrentProfessional() pro: ProfessionalProfile, @Param('id', ParseUUIDPipe) id: string) {
    return this.requests.decline(pro, id);
  }
}
