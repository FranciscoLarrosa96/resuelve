import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppException } from '../common/errors/app-exception';
import { ProfessionalProfile } from '../professionals/professional-profile.entity';
import { User } from './user.entity';
import { presentMe } from './user.presenter';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(ProfessionalProfile) private readonly profiles: Repository<ProfessionalProfile>,
  ) {}

  async me(userId: string) {
    const user = await this.users.findOneBy({ id: userId });
    if (!user) throw AppException.notFound('Usuario');
    const profile = await this.profiles.findOneBy({ userId });
    return presentMe(user, profile);
  }
}
