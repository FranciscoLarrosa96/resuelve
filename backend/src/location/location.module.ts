import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Zone } from '../catalog/zone.entity';
import { DisabledLocationProvider, GeoapifyLocationProvider, LOCATION_PROVIDER } from './location-provider';
import { LocationController } from './location.controller';
import { LocationService } from './location.service';

@Module({
  imports: [TypeOrmModule.forFeature([Zone])],
  controllers: [LocationController],
  providers: [
    LocationService,
    {
      provide: LOCATION_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        config.get('LOCATION_PROVIDER') === 'geoapify'
          ? new GeoapifyLocationProvider(config.get('GEOAPIFY_API_KEY'))
          : new DisabledLocationProvider(),
    },
  ],
  exports: [LocationService],
})
export class LocationModule {}
