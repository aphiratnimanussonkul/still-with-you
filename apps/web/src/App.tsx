import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { OfflineBanner } from '@/components/OfflineBanner';
import { PwaUpdatePrompt } from '@/components/PwaUpdatePrompt';
import { QueryLoading } from '@/components/QueryLoading';
import { useAuth } from '@/hooks/use-auth';
import { AUTH_CALLBACK_PATH, hasAuthCallbackParams } from '@/lib/auth-callback';
import { AuthCallbackPage } from '@/pages/AuthCallbackPage';
import { ConsentPage } from '@/pages/ConsentPage';
import { FamiliesPage } from '@/pages/FamiliesPage';
import { LoginPage } from '@/pages/LoginPage';
import { MemoriesPage } from '@/pages/MemoriesPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { RequireSession } from '@/pages/RequireSession';

export function App() {
  const { session, loading } = useAuth();
  const location = useLocation();

  const signedOutTo = hasAuthCallbackParams(location)
    ? { pathname: AUTH_CALLBACK_PATH, search: location.search, hash: location.hash }
    : '/login';

  return (
    <>
      <PwaUpdatePrompt />
      <OfflineBanner />
      {loading ? (
        <div className="mx-auto max-w-2xl px-4 py-10">
          <QueryLoading />
        </div>
      ) : (
        <Routes>
          <Route path={AUTH_CALLBACK_PATH} element={<AuthCallbackPage />} />
          <Route
            path="/login"
            element={session ? <Navigate to="/families" replace /> : <LoginPage />}
          />
          <Route element={<RequireSession />}>
            <Route path="/consent" element={<ConsentPage />} />
            <Route path="/families" element={<FamiliesPage />} />
            <Route path="/families/:familyId" element={<MemoriesPage />} />
          </Route>
          <Route path="/" element={<Navigate to={session ? '/families' : signedOutTo} replace />} />
          <Route path="*" element={session ? <NotFoundPage /> : <Navigate to={signedOutTo} replace />} />
        </Routes>
      )}
    </>
  );
}

export default App;
