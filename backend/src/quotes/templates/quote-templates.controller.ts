import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiConflictResponse, ApiNotFoundResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentProfessional, ProfessionalGuard } from '../../common/auth/professional.guard';
import { ThrottleWrite } from '../../common/throttle';
import { ProfessionalProfile } from '../../professionals/professional-profile.entity';
import { CreateQuoteTemplateDto } from './quote-template.dto';
import { QuoteTemplatesService } from './quote-templates.service';

const LIST = '{ items: [{ id, name, description, note, estimatedDuration, laborAmount, materialsAmount, createdAt }], max }';

/** Plantillas de presupuesto: privadas del profesional, sin efecto en el cupo ni en ninguna solicitud. */
@ApiTags('pro')
@ApiBearerAuth()
@UseGuards(ProfessionalGuard)
@Controller('pro/quote-templates')
export class QuoteTemplatesController {
  constructor(private readonly templates: QuoteTemplatesService) {}

  @Get()
  @ApiOkResponse({ description: LIST })
  list(@CurrentProfessional() profile: ProfessionalProfile) {
    return this.templates.list(profile);
  }

  @ThrottleWrite()
  @Post()
  @ApiOkResponse({ description: LIST })
  @ApiConflictResponse({ description: 'QUOTE_TEMPLATES_LIMIT_REACHED' })
  create(@CurrentProfessional() profile: ProfessionalProfile, @Body() dto: CreateQuoteTemplateDto) {
    return this.templates.create(profile, dto);
  }

  @Delete(':id')
  @ApiOkResponse({ description: LIST })
  @ApiNotFoundResponse({ description: 'No existe o es de otro perfil' })
  remove(@CurrentProfessional() profile: ProfessionalProfile, @Param('id', ParseUUIDPipe) id: string) {
    return this.templates.remove(profile, id);
  }
}
