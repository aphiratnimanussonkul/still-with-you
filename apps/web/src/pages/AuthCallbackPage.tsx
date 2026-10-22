import { Navigate } from 'react-router-dom';
import { QueryLoading } from '@/components/QueryLoading';
import { useAuth } from '@/hooks/use-auth';

/**
 * Dedicated OAuth return path. Stays put (no route bounce) until getSession /
 * detectSessionInUrl finishes exchanging `?code=` or reading `#access_token`.
 */
export function AuthCallbackPage() {
  const { session, loading } = useAuth();

  if (loading) return <QueryLoading />;
  if (session) return <Navigate to="/families" replace />;
  return <Navigate to="/login" replace />;
}
