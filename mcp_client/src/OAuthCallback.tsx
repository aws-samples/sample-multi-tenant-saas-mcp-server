import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

export default function OAuthCallback() {
  const [status, setStatus] = useState<"processing" | "success" | "error">("processing");
  const [message, setMessage] = useState("Processing OAuth callback...");
  const navigate = useNavigate();

  useEffect(() => {
    const handleCallback = async () => {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get("code");
        const state = urlParams.get("state");
        const error = urlParams.get("error");
        const errorDescription = urlParams.get("error_description");
        const errorUri = urlParams.get("error_uri");

        if (error) {
          setStatus("error");
          let errorMsg = `OAuth error: ${error}`;
          if (errorDescription) {
            errorMsg += `\nDescription: ${decodeURIComponent(errorDescription)}`;
          }
          if (errorUri) {
            errorMsg += `\nMore info: ${errorUri}`;
          }
          
          // Add specific guidance for common errors
          if (error === "invalid_request" && errorDescription?.includes("invalid_scope")) {
            errorMsg += `\n\nThis error typically means the OAuth server doesn't support the requested scopes. The app will automatically retry with different scope settings.`;
          }
          
          setMessage(errorMsg);
          console.error("OAuth error details:", { error, errorDescription, errorUri });
          
          // Send error to parent window
          if (window.opener) {
            window.opener.postMessage({
              type: 'oauth_error',
              error: errorMsg
            }, window.location.origin);
            
            setTimeout(() => {
              window.close();
            }, 3000);
          }
          return;
        }

        if (!code) {
          setStatus("error");
          const errorMsg = "No authorization code received";
          setMessage(errorMsg);
          
          // Send error to parent window
          if (window.opener) {
            window.opener.postMessage({
              type: 'oauth_error',
              error: errorMsg
            }, window.location.origin);
            
            setTimeout(() => {
              window.close();
            }, 3000);
          }
          return;
        }

        // Store the authorization code for the MCP client to pick up
        sessionStorage.setItem("oauth_authorization_code", code);
        if (state) {
          sessionStorage.setItem("oauth_state", state);
        }

        setStatus("success");
        setMessage("Authorization successful! Closing window...");

        // Send the authorization code to the parent window
        if (window.opener && !window.opener.closed) {
          console.log("Sending postMessage to parent window");
          try {
            window.opener.postMessage({
              type: 'oauth_success',
              code: code,
              state: state
            }, window.location.origin);
            console.log("PostMessage sent successfully");
          } catch (err) {
            console.error("Failed to send postMessage:", err);
          }
          
          // Close the popup after sending the message
          setTimeout(() => {
            console.log("Closing popup window");
            window.close();
          }, 1000);
        } else {
          console.log("No opener window found or opener is closed, using fallback redirect");
          // Fallback: redirect back to main app
          setTimeout(() => {
            navigate("/");
          }, 1500);
        }

      } catch (error) {
        console.error("OAuth callback error:", error);
        setStatus("error");
        setMessage(`Error processing callback: ${error instanceof Error ? error.message : String(error)}`);
      }
    };

    handleCallback();
  }, [navigate]);

  const getStatusColor = () => {
    switch (status) {
      case "success": return "text-green-600";
      case "error": return "text-red-600";
      default: return "text-aws-orange";
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case "success": return "✓";
      case "error": return "✗";
      default: return "⟳";
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full bg-white rounded-lg shadow-md p-6">
        <div className="text-center">
          <div className={`text-4xl mb-4 ${getStatusColor()}`}>
            {getStatusIcon()}
          </div>
          <h1 className="text-xl font-semibold mb-2">OAuth Callback</h1>
          <p className={`${getStatusColor()}`}>{message}</p>
          
          {status === "success" && (
            <p className="text-sm text-gray-500 mt-4">
              Redirecting back to the application...
            </p>
          )}
          
          {status === "error" && (
            <button
              onClick={() => navigate("/")}
              className="mt-4 px-4 py-2 bg-aws-orange text-white rounded-md hover:bg-aws-orange-dark"
            >
              Return to App
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
