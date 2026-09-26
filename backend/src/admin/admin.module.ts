import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminGuard } from '../common/auth/admin.guard';
import { User } from '../users/user.entity';
import { VerificationsModule } from '../verifications/verifications.module';
import { AdminVerificationsController } from './admin-verifications.controller';

@Module({
  imports: [VerificationsModule, TypeOrmModule.forFeature([User])],
  controllers: [AdminVerificationsController],
  providers: [AdminGuard],
})
export class AdminModule {}
