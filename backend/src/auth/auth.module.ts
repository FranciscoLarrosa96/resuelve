import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Zone } from '../catalog/zone.entity';
import { User } from '../users/user.entity';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { EmailVerificationModule } from './email-verification.module';
import { RefreshToken } from './refresh-token.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, RefreshToken, Zone]), UsersModule, EmailVerificationModule],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
