import { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { AuthScreen } from '@/components/AuthScreen';
import { useAuth } from '@/hooks/use-auth';
import { oauthCallbackError } from '@/lib/auth-callback';
import { postAuthPath } from '@/lib/auth-redirect';

function SignedInCallbackRedirect() {
  const [to] = useState(() => postAuthPath('/home'));
  return <Navigate to={to} replace />;
}

/**
 * Dedicated OAuth return path. Stays put (no route bounce) until getSession /
 * detectSessionInUrl finishes exchanging `?code=` or reading `#access_token`.
 * Provider `error` params go to /login with cancelled/failed copy — they must
 * not disappear into a silent redirect. A remembered invite path (sessionStorage)
 * sends the user back to /invites/:token after Google login.
 */
export function AuthCallbackPage() {
  const { session, loading } = useAuth();
  const location = useLocation();
  const oauthError = oauthCallbackError(location);

  if (oauthError) {
    return <Navigate to="/login" replace state={{ loginError: oauthError }} />;
  }

  if (loading) return <AuthScreen loading />;
  if (session) return <SignedInCallbackRedirect />;
  return <Navigate to="/login" replace />;
}
