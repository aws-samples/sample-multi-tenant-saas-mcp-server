declare module 'jsonwebtoken' {
  export interface JwtHeader {
    alg?: string;
    typ?: string;
    kid?: string;
  }

  export interface JwtPayload {
    iss?: string;
    sub?: string;
    aud?: string | string[];
    exp?: number;
    nbf?: number;
    iat?: number;
    jti?: string;
    [key: string]: any;
  }

  export type GetPublicKeyOrSecret = (
    err: any,
    secretOrPublicKey?: string | Buffer
  ) => void;

  export type SecretOrKeyProvider = (
    header: JwtHeader,
    callback: GetPublicKeyOrSecret
  ) => void;

  export function verify(
    token: string,
    secretOrPublicKey: string | Buffer | SecretOrKeyProvider,
    options?: {
      algorithms?: string[];
      audience?: string | string[];
      issuer?: string;
      ignoreExpiration?: boolean;
      ignoreNotBefore?: boolean;
      subject?: string;
      clockTolerance?: number;
      maxAge?: string | number;
      clockTimestamp?: number;
    },
    callback?: (err: any, decoded: any) => void
  ): void;
}

declare module 'jwks-rsa' {
  export interface SigningKey {
    getPublicKey(): string;
    rsaPublicKey?: string;
    publicKey?: string;
  }

  export interface JwksClient {
    getSigningKey(kid: string, callback: (err: any, key: SigningKey) => void): void;
  }

  export interface ClientOptions {
    jwksUri: string;
    requestHeaders?: Record<string, string>;
    timeout?: number;
    cache?: boolean;
    rateLimit?: boolean;
    jwksRequestsPerMinute?: number;
    cacheMaxEntries?: number;
    cacheMaxAge?: number;
  }

  export default function jwksClient(options: ClientOptions): JwksClient;
}
