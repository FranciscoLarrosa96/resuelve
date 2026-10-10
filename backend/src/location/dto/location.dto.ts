import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsUUID,
  IsString,
  Length,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

/** Token de sesión de autocompletado (agrupa la facturación del proveedor). Aleatorio del navegador. */
const SESSION = /^[A-Za-z0-9-]{8,64}$/;

export class AutocompleteDto {
  @ApiProperty({ description: 'Lo que escribió (mín. 3 caracteres)' })
  @IsString()
  @Length(3, 120)
  query: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(SESSION)
  sessionToken?: string;

  @ApiPropertyOptional({ description: 'Localidad del trabajo: orienta la búsqueda y define los barrios posibles' })
  @IsOptional()
  @IsUUID()
  localityId?: string;
}

export class ResolveAddressDto {
  @ApiPropertyOptional({ description: 'Sugerencia elegida (id del proveedor)' })
  @ValidateIf((o: ResolveAddressDto) => !o.address)
  @IsString()
  @MaxLength(512)
  placeId?: string;

  @ApiPropertyOptional({ description: 'Dirección escrita (si no eligió una sugerencia)' })
  @ValidateIf((o: ResolveAddressDto) => !o.placeId)
  @IsString()
  @Length(3, 200)
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(SESSION)
  sessionToken?: string;

  @ApiPropertyOptional({ description: 'Localidad del trabajo: orienta la búsqueda y define los barrios posibles' })
  @IsOptional()
  @IsUUID()
  localityId?: string;
}

/** "Usar mi ubicación": coordenadas del navegador. Se usan para geocodificar y se descartan. */
export class ReverseGeocodeDto {
  @ApiProperty()
  @IsLatitude()
  lat: number;

  @ApiProperty()
  @IsLongitude()
  lng: number;

  @ApiPropertyOptional({ description: 'Localidad del trabajo: orienta la búsqueda y define los barrios posibles' })
  @IsOptional()
  @IsUUID()
  localityId?: string;
}
