import { useState, useEffect, useCallback } from 'react';
import { CognitoUser, CognitoUserPool, AuthenticationDetails, CognitoUserSession } from 'amazon-cognito-identity-js';

interface AuthConfig {
  userPoolId: string;
  clientId: string;
  region: string;
}

interface User {
  username: string;
  email?: string;
  accessToken: string;
  idToken: string;
}

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: User | null;
  error: string | null;
}

export const useCognitoAuth = (config?: AuthConfig) => {
  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    isLoading: true,
    user: null,
    error: null,
  });

  const [userPool, setUserPool] = useState<CognitoUserPool | null>(null);

  // Initialize Cognito User Pool
  useEffect(() => {
    if (config) {
      const pool = new CognitoUserPool({
        UserPoolId: config.userPoolId,
        ClientId: config.clientId,
      });
      setUserPool(pool);
    }
  }, [config]);

  // Check for existing session
  useEffect(() => {
    if (!userPool) return;

    const cognitoUser = userPool.getCurrentUser();
    if (cognitoUser) {
      cognitoUser.getSession((err: any, session: CognitoUserSession | null) => {
        if (err) {
          setAuthState(prev => ({ ...prev, isLoading: false, error: err.message }));
          return;
        }

        if (session && session.isValid()) {
          const user: User = {
            username: cognitoUser.getUsername(),
            accessToken: session.getAccessToken().getJwtToken(),
            idToken: session.getIdToken().getJwtToken(),
          };

          setAuthState({
            isAuthenticated: true,
            isLoading: false,
            user,
            error: null,
          });
        } else {
          setAuthState(prev => ({ ...prev, isLoading: false }));
        }
      });
    } else {
      setAuthState(prev => ({ ...prev, isLoading: false }));
    }
  }, [userPool]);

  const signIn = useCallback((username: string, password: string) => {
    if (!userPool) return Promise.reject(new Error('User pool not initialized'));

    return new Promise<User>((resolve, reject) => {
      const authenticationDetails = new AuthenticationDetails({
        Username: username,
        Password: password,
      });

      const cognitoUser = new CognitoUser({
        Username: username,
        Pool: userPool,
      });

      setAuthState(prev => ({ ...prev, isLoading: true, error: null }));

      cognitoUser.authenticateUser(authenticationDetails, {
        onSuccess: (session: CognitoUserSession) => {
          console.log('🎉 Cognito authentication SUCCESS!', session);
          const user: User = {
            username: cognitoUser.getUsername(),
            accessToken: session.getAccessToken().getJwtToken(),
            idToken: session.getIdToken().getJwtToken(),
          };

          console.log('👤 Setting user state:', user);
          setAuthState({
            isAuthenticated: true,
            isLoading: false,
            user,
            error: null,
          });

          console.log('✅ Authentication state updated successfully');
          resolve(user);
        },
        onFailure: (err: any) => {
          console.error('❌ Cognito authentication FAILED:', err);
          setAuthState({
            isAuthenticated: false,
            isLoading: false,
            user: null,
            error: err.message,
          });
          reject(err);
        },
      });
    });
  }, [userPool]);

  const signOut = useCallback(() => {
    if (!userPool) return;

    const cognitoUser = userPool.getCurrentUser();
    if (cognitoUser) {
      cognitoUser.signOut();
    }

    setAuthState({
      isAuthenticated: false,
      isLoading: false,
      user: null,
      error: null,
    });
  }, [userPool]);

  return {
    ...authState,
    signIn,
    signOut,
  };
};
