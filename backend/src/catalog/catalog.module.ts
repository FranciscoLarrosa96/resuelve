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

@Module({
  imports: [TypeOrmModule.forFeature([Category, Service, Province, City, Zone])],
  controllers: [CatalogController, LocalitiesController],
  providers: [CatalogService, LocalitiesService],
  exports: [CatalogService, LocalitiesService],
})
export class CatalogModule {}
