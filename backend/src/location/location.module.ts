import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Zone } from '../catalog/zone.entity';
import { DisabledLocationProvider, GoogleLocationProvider, LOCATION_PROVIDER } from './location-provider';
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
        config.get('LOCATION_PROVIDER') === 'google'
          ? new GoogleLocationProvider(config.get('GOOGLE_MAPS_API_KEY'))
          : new DisabledLocationProvider(),
    },
  ],
})
export class LocationModule {}
