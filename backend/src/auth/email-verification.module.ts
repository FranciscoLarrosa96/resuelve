import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailModule } from '../email/email.module';
import { User } from '../users/user.entity';
import { EmailVerificationCode } from './email-verification-code.entity';
import { EmailVerificationService } from './email-verification.service';

@Module({
  imports: [TypeOrmModule.forFeature([EmailVerificationCode, User]), EmailModule],
  providers: [EmailVerificationService],
  exports: [EmailVerificationService],
})
export class EmailVerificationModule {}
