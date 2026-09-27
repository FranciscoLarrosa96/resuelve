import { Module } from '@nestjs/common';
import { readCloudinaryConfig } from '../common/cloudinary';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailVerifiedGuard } from '../common/auth/email-verified.guard';
import { ProfessionalGuard } from '../common/auth/professional.guard';
import { Review } from '../reviews/review.entity';
import { User } from '../users/user.entity';
import { ProfessionalProfile } from './professional-profile.entity';
import { ProfessionalsController, ProProfileController } from './professionals.controller';
import { ProfessionalsService } from './professionals.service';
import { ProfessionalAvatarController } from './avatar/avatar.controller';
import { ProfessionalAvatarService } from './avatar/avatar.service';
import { AVATAR_STORAGE, CloudinaryAvatarStorage } from './avatar/avatar-storage';

@Module({
  imports: [TypeOrmModule.forFeature([ProfessionalProfile, Review, User])],
  controllers: [ProfessionalsController, ProProfileController, ProfessionalAvatarController],
  providers: [
    ProfessionalsService,
    ProfessionalGuard,
    EmailVerifiedGuard,
    ProfessionalAvatarService,
    {
      provide: AVATAR_STORAGE,
      inject: [ConfigService],
      // Mismas credenciales de Cloudinary que las matrículas; otra carpeta y recursos públicos.
      useFactory: (config: ConfigService) =>
        new CloudinaryAvatarStorage(readCloudinaryConfig((k) => config.get<string>(k))),
    },
  ],
  exports: [ProfessionalsService],
})
export class ProfessionalsModule {}
