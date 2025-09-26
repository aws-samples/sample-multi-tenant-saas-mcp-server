import React, { createContext, useContext, useEffect, useState } from 'react';
import { CognitoUserPool, CognitoUser, AuthenticationDetails, CognitoUserSession } from 'amazon-cognito-identity-js';
import { getApiBaseUrl } from '../lib/config';

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

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: User | null;
  error: string | null;
  signIn: (username: string, password: string) => Promise<User>;
  signOut: () => void;
  getAccessToken: () => string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: React.ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [userPool, setUserPool] = useState<CognitoUserPool | null>(null);

  // Fetch auth configuration from backend
  useEffect(() => {
    const fetchAuthConfig = async () => {
      try {
        const apiBaseUrl = getApiBaseUrl();
        const response = await fetch(`${apiBaseUrl}/api/auth/config`);
        if (response.ok) {
          const config = await response.json();
          console.log('🔧 Auth config loaded:', config);
          setAuthConfig(config);
          
          // Initialize Cognito User Pool
          const pool = new CognitoUserPool({
            UserPoolId: config.userPoolId,
            ClientId: config.clientId,
          });
          setUserPool(pool);
        } else {
          console.error('Failed to fetch auth config:', response.statusText);
        }
      } catch (err) {
        console.error('Failed to fetch auth config:', err);
      } finally {
        setConfigLoading(false);
      }
    };

    fetchAuthConfig();
  }, []);

  const signIn = async (username: string, password: string): Promise<User> => {
    if (!userPool) throw new Error('User pool not initialized');

    return new Promise<User>((resolve, reject) => {
      const authenticationDetails = new AuthenticationDetails({
        Username: username,
        Password: password,
      });

      const cognitoUser = new CognitoUser({
        Username: username,
        Pool: userPool,
      });

      setIsLoading(true);
      setError(null);

      cognitoUser.authenticateUser(authenticationDetails, {
        onSuccess: (session: CognitoUserSession) => {
          console.log('🎉 Cognito authentication SUCCESS!', session);
          const newUser: User = {
            username: cognitoUser.getUsername(),
            accessToken: session.getAccessToken().getJwtToken(),
            idToken: session.getIdToken().getJwtToken(),
          };

          console.log('👤 Setting user state:', newUser);
          console.log('🔄 Before state update - isAuthenticated:', isAuthenticated, 'user:', user);
          
          setIsAuthenticated(true);
          console.log('✅ setIsAuthenticated(true) called');
          
          setIsLoading(false);
          console.log('✅ setIsLoading(false) called');
          
          setUser(newUser);
          console.log('✅ setUser called with:', newUser.username);
          
          setError(null);
          console.log('✅ setError(null) called');

          console.log('✅ All state setters called - waiting for re-render...');
          
          // Force a re-render check
          setTimeout(() => {
            console.log('🔍 State check after timeout - isAuthenticated:', isAuthenticated, 'user:', user?.username);
          }, 100);

          resolve(newUser);
        },
        onFailure: (err: any) => {
          console.error('❌ Cognito authentication FAILED:', err);
          setIsAuthenticated(false);
          setIsLoading(false);
          setUser(null);
          setError(err.message);
          reject(err);
        },
      });
    });
  };

  const signOut = () => {
    console.log('🚪 Signing out...');
    setIsAuthenticated(false);
    setUser(null);
    setError(null);
    
    if (userPool) {
      const cognitoUser = userPool.getCurrentUser();
      if (cognitoUser) {
        cognitoUser.signOut();
      }
    }
  };

  // Track state changes
  useEffect(() => {
    console.log('🔄 AuthContext: isAuthenticated changed to:', isAuthenticated);
  }, [isAuthenticated]);

  useEffect(() => {
    console.log('🔄 AuthContext: user changed to:', user?.username);
  }, [user]);

  const getAccessToken = () => {
    return user?.accessToken || null;
  };

  const contextValue: AuthContextType = {
    isAuthenticated,
    isLoading: configLoading || isLoading,
    user,
    error,
    signIn,
    signOut,
    getAccessToken,
  };

  // Debug logging
  console.log('🔐 AuthContext state:', {
    isAuthenticated: contextValue.isAuthenticated,
    isLoading: contextValue.isLoading,
    user: contextValue.user?.username,
    configLoading,
    authLoading: isLoading
  });

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};
