import { Navigate, useLocation } from 'react-router-dom';
import { QueryLoading } from '@/components/QueryLoading';
import { useAuth } from '@/hooks/use-auth';
import { oauthCallbackError } from '@/lib/auth-callback';

/**
 * Dedicated OAuth return path. Stays put (no route bounce) until getSession /
 * detectSessionInUrl finishes exchanging `?code=` or reading `#access_token`.
 * Provider `error` params go to /login with cancelled/failed copy — they must
 * not disappear into a silent redirect.
 */
export function AuthCallbackPage() {
  const { session, loading } = useAuth();
  const location = useLocation();
  const oauthError = oauthCallbackError(location);

  if (oauthError) {
    return <Navigate to="/login" replace state={{ loginError: oauthError }} />;
  }

  if (loading) return <QueryLoading />;
  if (session) return <Navigate to="/families" replace />;
  return <Navigate to="/login" replace />;
}
