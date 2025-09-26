import React, { useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { AuthComponent } from './AuthComponent';

interface ProtectedRouteProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ 
  children, 
  fallback 
}) => {
  const { isAuthenticated, isLoading, user } = useAuth();

  // Debug logging
  console.log('🔐 ProtectedRoute state:', { isAuthenticated, isLoading, user: user?.username });

  // Force re-render when authentication state changes
  useEffect(() => {
    console.log('🔄 ProtectedRoute: Authentication state changed', { isAuthenticated, user: user?.username });
  }, [isAuthenticated, user]);

  if (isLoading) {
    console.log('🔄 ProtectedRoute: Loading...');
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    console.log('❌ ProtectedRoute: Not authenticated, showing login');
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full">
          {fallback || (
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                Amazon Bedrock MCP Playground
              </h1>
              <p className="text-gray-600">
                Please sign in to access the application
              </p>
            </div>
          )}
          <AuthComponent />
        </div>
      </div>
    );
  }

  console.log('✅ ProtectedRoute: Authenticated, rendering main app');
  return <>{children}</>;
};
