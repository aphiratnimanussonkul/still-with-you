import { ErrorCode } from '@still-with-you/contracts';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { QueryLoading } from '@/components/QueryLoading';
import { useAuth } from '@/hooks/use-auth';
import { isFirstUse, useMe } from '@/hooks/use-me';
import { ApiClientError, messageForError } from '@/lib/api-errors';

export function RequireSession() {
  const { session, loading } = useAuth();
  const location = useLocation();
  const me = useMe();

  if (loading) return <QueryLoading />;
  if (!session) return <Navigate to="/login" replace />;

  if (me.isPending) return <QueryLoading />;
  if (me.isError) {
    if (me.error instanceof ApiClientError && me.error.code === ErrorCode.UNAUTHENTICATED) {
      return <Navigate to="/login" replace state={{ sessionExpired: true }} />;
    }
    return (
      <AppShell>
        <p className="text-body text-destructive">{messageForError(me.error)}</p>
      </AppShell>
    );
  }

  if (me.data && isFirstUse(me.data) && location.pathname !== '/consent') {
    return <Navigate to="/consent" replace />;
  }

  if (location.pathname === '/consent') {
    return <Outlet />;
  }

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
