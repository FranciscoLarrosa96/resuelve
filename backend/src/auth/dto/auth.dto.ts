import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsJWT,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const lowerTrim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class RegisterDto {
  @ApiProperty({ example: 'María' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  firstName: string;

  @ApiProperty({ example: 'González' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  lastName: string;

  @ApiProperty({ example: 'maria@example.com' })
  @Transform(lowerTrim)
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiProperty({ minLength: 10, maxLength: 128, example: 'una-clave-larga-y-segura' })
  @IsString()
  @MinLength(10)
  @MaxLength(128)
  password: string;

  @ApiPropertyOptional({ example: '+54 249 400 1234' })
  @IsOptional()
  @Transform(trim)
  @Matches(/^\+?[0-9 ()-]{6,32}$/, { message: 'phone no tiene un formato válido' })
  phone?: string;

  @ApiPropertyOptional({ description: 'Barrio habitual (id de /zones)' })
  @IsOptional()
  @IsUUID()
  defaultZoneId?: string;
}

export class LoginDto {
  @ApiProperty({ example: 'maria@resuelve.dev' })
  @Transform(lowerTrim)
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'resuelve-dev-2026' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password: string;
}

export class RefreshDto {
  @ApiProperty()
  @IsJWT()
  refreshToken: string;
}

export class AuthTokensDto {
  @ApiProperty() accessToken: string;
  @ApiProperty() refreshToken: string;
  @ApiProperty({ description: 'Segundos hasta que vence el access token' }) expiresIn: number;
  @ApiProperty({ example: 'Bearer' }) tokenType: 'Bearer';
}
