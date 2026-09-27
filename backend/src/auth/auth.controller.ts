import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Public } from '../common/auth/public.decorator';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { AuthTokensDto, ChangeEmailDto, LoginDto, RefreshDto, RegisterDto, VerifyEmailDto } from './dto/auth.dto';

/** Límite por IP para no dejar mandar decenas de códigos por minuto (además de cooldown/tope por cuenta). */
const VERIFICATION_LIMIT = Number(process.env.THROTTLE_VERIFICATION_LIMIT ?? 10);

/** Límite más estricto para endpoints sensibles a fuerza bruta (por IP, por minuto). */
const AUTH_LIMIT = Number(process.env.THROTTLE_AUTH_LIMIT ?? 10);

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
  ) {}

  @Public()
  @Throttle({ default: { limit: AUTH_LIMIT, ttl: 60_000 } })
  @Post('register')
  @ApiCreatedResponse({ type: AuthTokensDto })
  @ApiConflictResponse({ description: 'EMAIL_ALREADY_REGISTERED' })
  register(@Body() dto: RegisterDto): Promise<AuthTokensDto> {
    return this.auth.register(dto);
  }

  @Public()
  @Throttle({ default: { limit: AUTH_LIMIT, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: AuthTokensDto })
  @ApiUnauthorizedResponse({ description: 'INVALID_CREDENTIALS' })
  login(@Body() dto: LoginDto): Promise<AuthTokensDto> {
    return this.auth.login(dto);
  }

  @Public()
  @Throttle({ default: { limit: AUTH_LIMIT * 3, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: AuthTokensDto,
    description: 'Devuelve un par nuevo; el refresh token anterior deja de servir.',
  })
  @ApiUnauthorizedResponse({ description: 'INVALID_REFRESH_TOKEN' })
  refresh(@Body() dto: RefreshDto): Promise<AuthTokensDto> {
    return this.auth.refresh(dto.refreshToken);
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Revoca el refresh token (idempotente).' })
  logout(@Body() dto: RefreshDto): Promise<void> {
    return this.auth.logout(dto.refreshToken);
  }

  @ApiBearerAuth()
  @Get('me')
  @ApiOkResponse({ description: 'Usuario autenticado y, si tiene, su professionalProfileId.' })
  me(@CurrentUser() user: AuthUser) {
    return this.users.me(user.userId);
  }

  @ApiBearerAuth()
  @Throttle({ default: { limit: VERIFICATION_LIMIT, ttl: 60_000 } })
  @Post('email-verification/send')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Envía (o reenvía) el código de 6 dígitos al email de la cuenta.' })
  @ApiConflictResponse({ description: 'EMAIL_ALREADY_VERIFIED' })
  sendEmailVerification(@CurrentUser() user: AuthUser): Promise<void> {
    return this.auth.sendEmailVerification(user.userId);
  }

  @ApiBearerAuth()
  @Throttle({ default: { limit: VERIFICATION_LIMIT, ttl: 60_000 } })
  @Post('email-verification/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: 'Marca el email como verificado si el código coincide.' })
  verifyEmail(@CurrentUser() user: AuthUser, @Body() dto: VerifyEmailDto) {
    return this.auth.verifyEmail(user.userId, dto.code);
  }

  @ApiBearerAuth()
  @Throttle({ default: { limit: AUTH_LIMIT, ttl: 60_000 } })
  @Patch('email')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Cambia el email antes de verificar y manda un código nuevo.' })
  @ApiConflictResponse({ description: 'EMAIL_ALREADY_VERIFIED | EMAIL_ALREADY_REGISTERED' })
  @ApiUnauthorizedResponse({ description: 'INVALID_CREDENTIALS' })
  changeEmail(@CurrentUser() user: AuthUser, @Body() dto: ChangeEmailDto): Promise<void> {
    return this.auth.changeEmailBeforeVerification(user.userId, dto);
  }
}
