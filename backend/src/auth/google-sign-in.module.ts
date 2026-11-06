import { Global, Module } from '@nestjs/common';
import { GOOGLE_TOKEN_VERIFIER, GoogleAuthLibraryVerifier } from './google-sign-in';

/** Un solo verificador de Google para el ingreso y para confirmar la baja de la cuenta. */
@Global()
@Module({
  providers: [{ provide: GOOGLE_TOKEN_VERIFIER, useClass: GoogleAuthLibraryVerifier }],
  exports: [GOOGLE_TOKEN_VERIFIER],
})
export class GoogleSignInModule {}
