import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
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
import { AuthTokensDto, LoginDto, RefreshDto, RegisterDto } from './dto/auth.dto';

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
}
