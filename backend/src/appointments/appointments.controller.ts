import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { CurrentProfessional, ProfessionalGuard } from '../common/auth/professional.guard';
import { ProfessionalProfile } from '../professionals/professional-profile.entity';
import { AppointmentsService } from './appointments.service';
import { AppointmentsQueryDto, ProposeAppointmentDto } from './dto/appointment.dto';

/** Cliente dueño (confirmar, pedir otro horario) y ambas partes (cancelar el horario). */
@ApiTags('appointments')
@ApiBearerAuth()
@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}

  @Post(':id/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: 'Devuelve la solicitud del cliente (SCHEDULED). Repetirlo no cambia nada.' })
  @ApiNotFoundResponse({ description: 'La cita no existe o no es de una solicitud tuya' })
  @ApiConflictResponse({
    description: 'APPOINTMENT_STATE_CHANGED | APPOINTMENT_EXPIRED | APPOINTMENT_OVERLAP',
  })
  confirm(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.appointments.confirm(user.userId, id);
  }

  @Post(':id/decline')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: '"No puedo en ese horario". La solicitud sigue con el mismo profesional.' })
  @ApiConflictResponse({ description: 'APPOINTMENT_STATE_CHANGED' })
  decline(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.appointments.decline(user.userId, id);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    description:
      'Cancela el horario (no la solicitud). Cliente: cita confirmada. Profesional elegido: propuesta o confirmada. ' +
      'Devuelve la solicitud vista por quien canceló.',
  })
  @ApiConflictResponse({ description: 'APPOINTMENT_STATE_CHANGED' })
  cancel(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.appointments.cancel(user.userId, id);
  }
}

/** Profesional elegido: proponer/reprogramar y agenda. */
@ApiTags('pro')
@ApiBearerAuth()
@UseGuards(ProfessionalGuard)
@Controller('pro')
export class ProAppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}

  @Post('requests/:id/appointments')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: 'Devuelve la solicitud del profesional con la nueva cita PROPOSED.' })
  @ApiNotFoundResponse({ description: 'No sos el profesional elegido' })
  @ApiConflictResponse({
    description: 'INVALID_REQUEST_STATE | APPOINTMENT_STATE_CHANGED | APPOINTMENT_OVERLAP',
  })
  propose(
    @CurrentProfessional() pro: ProfessionalProfile,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ProposeAppointmentDto,
  ) {
    return this.appointments.propose(pro, id, dto);
  }

  @Get('appointments')
  @ApiOkResponse({
    description: 'Agenda: citas PROPOSED, CONFIRMED y COMPLETED que se cruzan con [from, to). Máx. 62 días.',
  })
  agenda(@CurrentProfessional() pro: ProfessionalProfile, @Query() query: AppointmentsQueryDto) {
    return this.appointments.agenda(pro, query);
  }

  @Get('appointments/completion-due')
  @ApiOkResponse({
    description:
      'Pendientes de cierre: citas CONFIRMED cuyo horario ya terminó y siguen sin marcarse realizadas.',
  })
  completionDue(@CurrentProfessional() pro: ProfessionalProfile) {
    return this.appointments.completionDue(pro);
  }
}

/** Cierre del trabajo: una sola operación para el cliente dueño y el profesional elegido. */
@ApiTags('requests')
@ApiBearerAuth()
@Controller('requests')
export class RequestCompletionController {
  constructor(private readonly appointments: AppointmentsService) {}

  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    description:
      'Cita y solicitud COMPLETED (lo confirma el cliente o el profesional elegido, después del horario). ' +
      'Devuelve la solicitud vista por quien actúa. Repetirlo (o que la otra parte ya lo haya cerrado) no cambia nada.',
  })
  @ApiNotFoundResponse({ description: 'No es tu solicitud ni sos el profesional elegido' })
  @ApiConflictResponse({
    description: 'INVALID_REQUEST_STATE | APPOINTMENT_STATE_CHANGED | APPOINTMENT_NOT_ENDED',
  })
  complete(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.appointments.complete(user.userId, id);
  }
}
