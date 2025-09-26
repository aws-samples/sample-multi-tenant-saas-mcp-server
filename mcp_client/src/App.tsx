import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import MainApp from "./MainApp";
import OAuthCallback from "./OAuthCallback";

function AppContent() {
  const { isAuthenticated, user } = useAuth();
  
  // Use authentication state as key to force re-render when it changes
  const appKey = `app-${isAuthenticated}-${user?.username || 'anonymous'}`;
  
  return (
    <Router key={appKey}>
      <Routes>
        <Route 
          path="/" 
          element={
            <ProtectedRoute>
              <MainApp />
            </ProtectedRoute>
          } 
        />
        <Route path="/oauth/callback" element={<OAuthCallback />} />
      </Routes>
    </Router>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
