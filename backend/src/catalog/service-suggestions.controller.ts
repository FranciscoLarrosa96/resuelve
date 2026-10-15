import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeController } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AdminGuard } from '../common/auth/admin.guard';
import type { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { ApproveServiceDto, RejectServiceDto, SuggestionQueryDto, SuggestServiceDto } from './dto/service-suggestion.dto';
import { ServiceSuggestionsService } from './service-suggestions.service';

@ApiBearerAuth()
@Controller('service-suggestions')
export class ServiceSuggestionsController {
  constructor(private readonly suggestions: ServiceSuggestionsService) {}

  @Get()
  mine(@CurrentUser() user: AuthUser) { return this.suggestions.mine(user.userId); }

  @Post()
  @Throttle({ default: { limit: Number(process.env.THROTTLE_WRITE_LIMIT ?? 10), ttl: 60_000 } })
  suggest(@CurrentUser() user: AuthUser, @Body() dto: SuggestServiceDto) {
    return this.suggestions.suggest(user.userId, dto.name);
  }
}

@ApiExcludeController()
@ApiBearerAuth()
@UseGuards(AdminGuard)
@Controller('admin/service-suggestions')
export class AdminServiceSuggestionsController {
  constructor(private readonly suggestions: ServiceSuggestionsService) {}

  @Get()
  list(@Query() query: SuggestionQueryDto) { return this.suggestions.adminList(query); }

  @Post(':id/approve')
  @Throttle({ default: { limit: Number(process.env.THROTTLE_ADMIN_LIMIT ?? 30), ttl: 60_000 } })
  approve(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser, @Body() dto: ApproveServiceDto) {
    return this.suggestions.approve(id, user.userId, dto);
  }

  @Post(':id/reject')
  @Throttle({ default: { limit: Number(process.env.THROTTLE_ADMIN_LIMIT ?? 30), ttl: 60_000 } })
  reject(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser, @Body() dto: RejectServiceDto) {
    return this.suggestions.reject(id, user.userId, dto.reason);
  }
}
