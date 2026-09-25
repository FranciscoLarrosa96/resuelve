import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { Category } from './category.entity';
import { City } from './city.entity';
import { Service } from './service.entity';
import { Zone } from './zone.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Category, Service, City, Zone])],
  controllers: [CatalogController],
  providers: [CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}
