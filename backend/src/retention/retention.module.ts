import { Module } from '@nestjs/common';
import { ClientProfessionalsController, FavoritesController } from './retention.controller';
import { RetentionService } from './retention.service';

/** Retención del cliente: guardar profesionales, "Mis profesionales" y volver a contratar. */
@Module({
  controllers: [ClientProfessionalsController, FavoritesController],
  providers: [RetentionService],
})
export class RetentionModule {}
