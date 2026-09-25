/** Lo que el access token dice del usuario (payload verificado). */
export interface AuthUser {
  userId: string;
  email: string;
}

export interface AccessTokenPayload {
  sub: string;
  email: string;
  typ: 'access';
}
