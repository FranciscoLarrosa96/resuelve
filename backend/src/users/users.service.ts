import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { findActiveLocality } from '../catalog/localities.service';
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
    const user = await this.users.findOne({ where: { id: userId }, relations: { preferredCity: { provinceRef: true } } });
    if (!user) throw AppException.notFound('Usuario');
    const profile = await this.profiles.findOneBy({ userId });
    return presentMe(user, profile);
  }

  /** Ciudad elegida para buscar (preferencia; null la borra). Validada en el catálogo. */
  async setPreferredLocality(userId: string, localityId: string | null) {
    if (localityId) await findActiveLocality(this.users.manager, localityId);
    await this.users.update(userId, { preferredCityId: localityId });
    return this.me(userId);
  }
}
