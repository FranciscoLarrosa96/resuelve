import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProfessionalProfile } from '../professionals/professional-profile.entity';
import { User } from './user.entity';
import { UsersService } from './users.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, ProfessionalProfile])],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
