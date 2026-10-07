import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsString, IsUrl, Matches, MaxLength, ValidateNested } from 'class-validator';

const BASE64URL = /^[A-Za-z0-9_-]+={0,2}$/;

export class PushKeysDto {
  @ApiProperty()
  @IsString()
  @MaxLength(200)
  @Matches(BASE64URL)
  p256dh: string;

  @ApiProperty()
  @IsString()
  @MaxLength(100)
  @Matches(BASE64URL)
  auth: string;
}

/** Lo que devuelve `PushSubscription.toJSON()` en el navegador (sin `expirationTime`). */
export class PushSubscriptionDto {
  @ApiProperty({ description: 'URL del servicio de push del navegador (https)' })
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(1000)
  endpoint: string;

  @ApiProperty({ type: PushKeysDto })
  @ValidateNested()
  @Type(() => PushKeysDto)
  keys: PushKeysDto;
}

export class PushEndpointDto {
  @ApiProperty()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(1000)
  endpoint: string;
}
