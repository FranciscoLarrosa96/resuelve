import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { AccountService } from './account.service';
import { DeleteAccountDto } from './account.dto';

/** Probar contraseñas es lo único caro de acá: límite propio y bajo. */
const DELETE_LIMIT = Number(process.env.THROTTLE_ACCOUNT_DELETE_LIMIT ?? 5);

@ApiTags('account')
@ApiBearerAuth()
@Controller('account')
export class AccountController {
  constructor(private readonly account: AccountService) {}

  @Get('deletion-check')
  @ApiOkResponse({ description: '{ canDelete, blockers: [{ code, count, message }] }' })
  check(@CurrentUser() user: AuthUser) {
    return this.account.check(user.userId);
  }

  @Post('delete')
  @HttpCode(200)
  @Throttle({ default: { limit: DELETE_LIMIT, ttl: 60_000 } })
  @ApiOkResponse({
    description:
      'Baja definitiva: anonimiza la cuenta. { deleted: true }. 403 ACCOUNT_PASSWORD_INCORRECT · 409 ACCOUNT_DELETE_BLOCKED (details.blockers) · 502 ACCOUNT_DELETE_FAILED',
  })
  delete(@CurrentUser() user: AuthUser, @Body() dto: DeleteAccountDto) {
    return this.account.delete(user.userId, dto.password);
  }
}
