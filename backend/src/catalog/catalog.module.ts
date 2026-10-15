import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { Category } from './category.entity';
import { City } from './city.entity';
import { Service } from './service.entity';
import { LocalitiesController } from './localities.controller';
import { LocalitiesService } from './localities.service';
import { Province } from './province.entity';
import { Zone } from './zone.entity';
import { AdminGuard } from '../common/auth/admin.guard';
import { User } from '../users/user.entity';
import { ServiceSuggestionsController, AdminServiceSuggestionsController } from './service-suggestions.controller';
import { ServiceSuggestionsService } from './service-suggestions.service';

@Module({
  imports: [TypeOrmModule.forFeature([Category, Service, Province, City, Zone, User])],
  controllers: [CatalogController, LocalitiesController, ServiceSuggestionsController, AdminServiceSuggestionsController],
  providers: [CatalogService, LocalitiesService, ServiceSuggestionsService, AdminGuard],
  exports: [CatalogService, LocalitiesService],
})
export class CatalogModule {}
