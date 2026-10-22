import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiNotFoundResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
import { DataSource } from 'typeorm';
import type { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { AppException } from '../common/errors/app-exception';
import { ThrottleWrite } from '../common/throttle';
import { demandAlertActive, requestDemandAlert } from './demand-alerts';

export class DemandAlertDto {
  @IsUUID()
  cityId: string;

  @IsUUID()
  serviceId: string;
}

/** "Avisame cuando haya": la persona pide que le avisemos cuando haya profesionales de un servicio en su localidad. */
@ApiTags('demand-alerts')
@ApiBearerAuth()
@Controller('me/demand-alerts')
export class DemandAlertsController {
  constructor(private readonly dataSource: DataSource) {}

  @Get()
  @ApiOkResponse({ description: '{ active }: hay un aviso pendiente para esa localidad y servicio.' })
  async status(@CurrentUser() user: AuthUser, @Query() q: DemandAlertDto) {
    return { active: await demandAlertActive(this.dataSource, user.userId, q.cityId, q.serviceId) };
  }

  @ThrottleWrite()
  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: '{ active: true }. Idempotente; si ya se había avisado, lo vuelve a activar.' })
  @ApiNotFoundResponse({ description: 'La localidad o el servicio no existen o no están activos' })
  async create(@CurrentUser() user: AuthUser, @Body() dto: DemandAlertDto) {
    if (!(await requestDemandAlert(this.dataSource, user.userId, dto.cityId, dto.serviceId)))
      throw AppException.notFound('Localidad o servicio');
    return { active: true };
  }
}
