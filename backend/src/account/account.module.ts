import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readCloudinaryConfig } from '../common/cloudinary';
import { AVATAR_STORAGE, CloudinaryAvatarStorage } from '../professionals/avatar/avatar-storage';
import { CloudinaryDocumentStorage, DOCUMENT_STORAGE } from '../verifications/document-storage';
import { AccountController } from './account.controller';
import { AccountService } from './account.service';

@Module({
  controllers: [AccountController],
  providers: [
    AccountService,
    // Mismas credenciales de Cloudinary que perfil y matrículas (carpetas y tipos distintos).
    {
      provide: AVATAR_STORAGE,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new CloudinaryAvatarStorage(readCloudinaryConfig((k) => config.get<string>(k))),
    },
    {
      provide: DOCUMENT_STORAGE,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new CloudinaryDocumentStorage(readCloudinaryConfig((k) => config.get<string>(k))),
    },
  ],
  exports: [AccountService],
})
export class AccountModule {}
