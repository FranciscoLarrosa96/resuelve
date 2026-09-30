import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiNotFoundResponse, ApiTags } from '@nestjs/swagger';
import { CurrentProfessional, ProfessionalGuard } from '../common/auth/professional.guard';
import { ProfessionalProfile } from '../professionals/professional-profile.entity';
import { JobChecklistDto, JobNotesDto, ScheduleJobDto } from './dto/job.dto';
import { JobsService } from './jobs.service';

@ApiTags('pro')
@ApiBearerAuth()
@UseGuards(ProfessionalGuard)
@Controller('pro/jobs')
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Get()
  list(@CurrentProfessional() pro: ProfessionalProfile) {
    return this.jobs.list(pro);
  }

  @Get(':id')
  @ApiNotFoundResponse({ description: 'El trabajo no existe o pertenece a otro profesional' })
  get(@CurrentProfessional() pro: ProfessionalProfile, @Param('id', ParseUUIDPipe) id: string) {
    return this.jobs.get(pro, id);
  }

  @Post(':id/schedule')
  @HttpCode(HttpStatus.OK)
  schedule(
    @CurrentProfessional() pro: ProfessionalProfile,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ScheduleJobDto,
  ) {
    return this.jobs.schedule(pro, id, dto);
  }

  @Post(':id/start')
  @HttpCode(HttpStatus.OK)
  start(@CurrentProfessional() pro: ProfessionalProfile, @Param('id', ParseUUIDPipe) id: string) {
    return this.jobs.start(pro, id);
  }

  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  complete(@CurrentProfessional() pro: ProfessionalProfile, @Param('id', ParseUUIDPipe) id: string) {
    return this.jobs.complete(pro, id);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(@CurrentProfessional() pro: ProfessionalProfile, @Param('id', ParseUUIDPipe) id: string) {
    return this.jobs.cancel(pro, id);
  }

  @Patch(':id/notes')
  updateNotes(
    @CurrentProfessional() pro: ProfessionalProfile,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: JobNotesDto,
  ) {
    return this.jobs.updateNotes(pro, id, dto);
  }

  @Patch(':id/checklist')
  updateChecklist(
    @CurrentProfessional() pro: ProfessionalProfile,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: JobChecklistDto,
  ) {
    return this.jobs.updateChecklist(pro, id, dto);
  }
}
