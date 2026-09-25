import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiConflictResponse, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { CurrentProfessional, ProfessionalGuard } from '../common/auth/professional.guard';
import { ProfessionalProfile } from '../professionals/professional-profile.entity';
import { AppointmentsService } from './appointments.service';
import { AppointmentsQueryDto, ScheduleAppointmentDto } from './dto/appointment.dto';

@ApiTags('appointments')
@ApiBearerAuth()
@Controller()
export class AppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}

  @Post('requests/:id/appointment')
  @ApiConflictResponse({ description: 'INVALID_REQUEST_STATE (requiere PROFESSIONAL_SELECTED)' })
  schedule(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ScheduleAppointmentDto,
  ) {
    return this.appointments.schedule(user.userId, id, dto);
  }

  @UseGuards(ProfessionalGuard)
  @Get('pro/appointments')
  list(@CurrentProfessional() pro: ProfessionalProfile, @Query() query: AppointmentsQueryDto) {
    return this.appointments.listForProfessional(pro, query);
  }
}
