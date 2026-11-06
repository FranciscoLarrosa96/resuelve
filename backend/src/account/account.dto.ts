import { IsNotEmpty, IsOptional, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';

export class DeleteAccountDto {
  /** La contraseña actual: confirma que quien pide la baja es la persona titular. */
  @ValidateIf((dto: DeleteAccountDto) => !dto.googleCredential)
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password?: string;

  /** Alternativa para cuentas que entran con Google: un ID token nuevo de la misma cuenta de Google. */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  googleCredential?: string;
}
