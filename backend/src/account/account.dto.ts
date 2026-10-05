import { IsString, MaxLength, MinLength } from 'class-validator';

export class DeleteAccountDto {
  /** La contraseña actual: confirma que quien pide la baja es la persona titular. */
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password: string;
}
