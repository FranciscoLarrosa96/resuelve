import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProfessionalGuard } from '../common/auth/professional.guard';
import { Review } from '../reviews/review.entity';
import { ProfessionalProfile } from './professional-profile.entity';
import { ProfessionalsController, ProProfileController } from './professionals.controller';
import { ProfessionalsService } from './professionals.service';
import { ProfessionalAvatarController } from './avatar/avatar.controller';
import { ProfessionalAvatarService } from './avatar/avatar.service';
import { AVATAR_STORAGE, CloudinaryAvatarStorage } from './avatar/avatar-storage';

@Module({
  imports: [TypeOrmModule.forFeature([ProfessionalProfile, Review])],
  controllers: [ProfessionalsController, ProProfileController, ProfessionalAvatarController],
  providers: [
    ProfessionalsService,
    ProfessionalGuard,
    ProfessionalAvatarService,
    {
      provide: AVATAR_STORAGE,
      inject: [ConfigService],
      // Mismas credenciales de Cloudinary que las matrículas; otra carpeta y recursos públicos.
      useFactory: (config: ConfigService) =>
        new CloudinaryAvatarStorage({
          cloudName: config.get('CLOUDINARY_CLOUD_NAME'),
          apiKey: config.get('CLOUDINARY_API_KEY'),
          apiSecret: config.get('CLOUDINARY_API_SECRET'),
          apiBase: config.get('CLOUDINARY_API_BASE'),
        }),
    },
  ],
  exports: [ProfessionalsService],
})
export class ProfessionalsModule {}
