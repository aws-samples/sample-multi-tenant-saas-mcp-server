declare module 'amazon-cognito-identity-js' {
  export interface ICognitoUserPoolData {
    UserPoolId: string;
    ClientId: string;
  }

  export interface ICognitoUserData {
    Username: string;
    Pool: CognitoUserPool;
  }

  export interface IAuthenticationDetailsData {
    Username: string;
    Password: string;
  }

  export class CognitoUserPool {
    constructor(data: ICognitoUserPoolData);
    getCurrentUser(): CognitoUser | null;
  }

  export class CognitoUser {
    constructor(data: ICognitoUserData);
    getUsername(): string;
    authenticateUser(
      authenticationDetails: AuthenticationDetails,
      callbacks: {
        onSuccess: (session: CognitoUserSession) => void;
        onFailure: (err: any) => void;
      }
    ): void;
    getSession(callback: (err: any, session: CognitoUserSession | null) => void): void;
    signOut(): void;
  }

  export class AuthenticationDetails {
    constructor(data: IAuthenticationDetailsData);
  }

  export class CognitoUserSession {
    isValid(): boolean;
    getAccessToken(): CognitoAccessToken;
    getIdToken(): CognitoIdToken;
  }

  export class CognitoAccessToken {
    getJwtToken(): string;
  }

  export class CognitoIdToken {
    getJwtToken(): string;
  }
}
