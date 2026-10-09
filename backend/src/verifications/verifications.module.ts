import { Module } from '@nestjs/common';
import { readCloudinaryConfig } from '../common/cloudinary';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProfessionalGuard } from '../common/auth/professional.guard';
import { ProfessionalProfile } from '../professionals/professional-profile.entity';
import { ProfessionalsModule } from '../professionals/professionals.module';
import { CloudinaryDocumentStorage, DOCUMENT_STORAGE } from './document-storage';
import { VerificationReviewService } from './verification-review.service';
import { VerificationsController } from './verifications.controller';
import { VerificationsService } from './verifications.service';

@Module({
  imports: [ProfessionalsModule, TypeOrmModule.forFeature([ProfessionalProfile])],
  controllers: [VerificationsController],
  providers: [
    VerificationsService,
    VerificationReviewService,
    ProfessionalGuard,
    {
      provide: DOCUMENT_STORAGE,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new CloudinaryDocumentStorage(readCloudinaryConfig((k) => config.get<string>(k))),
    },
  ],
  // DOCUMENT_STORAGE: también lo usan los comprobantes de transferencia (misma carpeta privada, otra subcarpeta).
  exports: [VerificationReviewService, DOCUMENT_STORAGE],
})
export class VerificationsModule {}
