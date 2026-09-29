import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsLatitude, IsLongitude, IsString, Length, MaxLength, ValidateIf } from 'class-validator';

export class AutocompleteDto {
  @ApiProperty({ description: 'Texto de busqueda (minimo 3 caracteres)' })
  @IsString()
  @Length(3, 120)
  query: string;
}

export class ResolveAddressDto {
  @ApiPropertyOptional({ description: 'Identificador de un resultado Geoapify' })
  @ValidateIf((o: ResolveAddressDto) => !o.address)
  @IsString()
  @MaxLength(512)
  placeId?: string;

  @ApiPropertyOptional({ description: 'Direccion elegida o escrita para geocodificar' })
  @ValidateIf((o: ResolveAddressDto) => !o.placeId)
  @IsString()
  @Length(3, 200)
  address?: string;
}

/** Coordenadas puntuales que el servidor vuelve a geocodificar y valida. */
export class ReverseGeocodeDto {
  @ApiProperty()
  @IsLatitude()
  lat: number;

  @ApiProperty()
  @IsLongitude()
  lng: number;
}
