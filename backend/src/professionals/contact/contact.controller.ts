import { Body, Controller, Header, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiNotFoundResponse, ApiOkResponse, ApiTags, ApiUnprocessableEntityResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { CurrentProfessional, ProfessionalGuard } from '../../common/auth/professional.guard';
import { Public } from '../../common/auth/public.decorator';
import { ThrottleWrite } from '../../common/throttle';
import { ContactRevealDto, ContactSettingsDto } from '../dto/professional.dto';
import { ProfessionalProfile } from '../professional-profile.entity';
import { ProfessionalsService } from '../professionals.service';
import { ContactService } from './contact.service';

/** Números entregados por minuto e IP: alcanza para quien busca y compara, frena a un scraper. */
const CONTACT_LIMIT = Number(process.env.THROTTLE_CONTACT_LIMIT ?? 20);

@ApiTags('professionals')
@Controller('professionals')
export class ContactController {
  constructor(private readonly contact: ContactService) {}

  /**
   * WhatsApp o teléfono de un profesional, al tocar el botón. Público (sin cuenta), con
   * límite por IP. Registra el clic de forma anónima: un clic no es una conversación ni
   * un trabajo, y no crea solicitudes ni consume cupos.
   */
  @Public()
  @Post(':id/contact')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: CONTACT_LIMIT, ttl: 60_000 } })
  @ApiOkResponse({ description: '{ channel, href, number, display }' })
  @ApiNotFoundResponse({ description: 'NOT_FOUND: perfil no público o canal no habilitado' })
  reveal(@Param('id') id: string, @Body() dto: ContactRevealDto, @CurrentUser() user?: AuthUser) {
    return this.contact.reveal(id, dto, user);
  }
}

@ApiTags('pro')
@ApiBearerAuth()
@Controller('pro')
export class ProContactController {
  constructor(
    private readonly contact: ContactService,
    private readonly professionals: ProfessionalsService,
  ) {}

  /** "¿Cómo querés que te contacten?": reemplaza la configuración y devuelve /pro/me. */
  @UseGuards(ProfessionalGuard)
  @ThrottleWrite()
  @Patch('contact')
  @ApiUnprocessableEntityResponse({ description: 'CONTACT_CHANNEL_REQUIRED · CONTACT_CONSENT_REQUIRED · INVALID_PHONE' })
  async update(@CurrentProfessional() profile: ProfessionalProfile, @Body() dto: ContactSettingsDto) {
    await this.contact.update(profile.id, dto);
    return this.professionals.getOwn(profile.id);
  }
}
