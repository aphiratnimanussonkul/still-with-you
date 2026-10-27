import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { OfflineBanner } from '@/components/OfflineBanner';
import { PwaUpdatePrompt } from '@/components/PwaUpdatePrompt';
import { QueryLoading } from '@/components/QueryLoading';
import { IconProvider } from '@/components/ui/icon';
import { useAuth } from '@/hooks/use-auth';
import { AUTH_CALLBACK_PATH, hasAuthCallbackParams } from '@/lib/auth-callback';
import { useInviteReferrerPolicy } from '@/lib/invite-privacy';
import { rememberFamilyId } from '@/lib/last-family';
import { AuthCallbackPage } from '@/pages/AuthCallbackPage';
import { ConsentPage } from '@/pages/ConsentPage';
import { AddPersonPage } from '@/pages/AddPersonPage';
import { FamilyPage } from '@/pages/FamilyPage';
import { HomePage } from '@/pages/HomePage';
import { PersonFormPage } from '@/pages/PersonFormPage';
import { PersonInvitePage } from '@/pages/PersonInvitePage';
import { PersonPage } from '@/pages/PersonPage';
import { LoginPage } from '@/pages/LoginPage';
import { MePage } from '@/pages/MePage';
import { MemoriesPage } from '@/pages/MemoriesPage';
import { MemoryDetailPage } from '@/pages/MemoryDetailPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { RequireSession } from '@/pages/RequireSession';
import { SettingsPage } from '@/pages/SettingsPage';
import { TrashPage } from '@/pages/TrashPage';

function LegacyFamilyMemoriesRedirect() {
  const { familyId } = useParams();
  useEffect(() => {
    if (familyId) rememberFamilyId(familyId);
  }, [familyId]);
  return <Navigate to="/memories" replace />;
}

export function App() {
  const { session, loading } = useAuth();
  const location = useLocation();
  useInviteReferrerPolicy(location.pathname);

  const signedOutTo = hasAuthCallbackParams(location)
    ? { pathname: AUTH_CALLBACK_PATH, search: location.search, hash: location.hash }
    : '/login';

  return (
    <IconProvider>
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
            element={session ? <Navigate to="/home" replace /> : <LoginPage />}
          />
          <Route path="/invites/:inviteId" element={<PersonInvitePage />} />
          <Route element={<RequireSession />}>
            <Route path="/consent" element={<ConsentPage />} />
            <Route path="/home" element={<HomePage />} />
            <Route path="/memories" element={<MemoriesPage />} />
            <Route path="/memories/:eventId" element={<MemoryDetailPage />} />
            <Route path="/family" element={<FamilyPage />} />
            <Route path="/family/people/new" element={<AddPersonPage />} />
            <Route path="/family/people/:personId/edit" element={<PersonFormPage />} />
            <Route path="/family/people/:personId" element={<PersonPage />} />
            <Route path="/me" element={<MePage />} />
            <Route path="/me/trash" element={<TrashPage />} />
            <Route path="/families" element={<Navigate to="/family" replace />} />
            <Route path="/families/:familyId" element={<LegacyFamilyMemoriesRedirect />} />
            <Route path="/trash" element={<Navigate to="/me/trash" replace />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
          <Route path="/" element={<Navigate to={session ? '/home' : signedOutTo} replace />} />
          <Route path="*" element={session ? <NotFoundPage /> : <Navigate to={signedOutTo} replace />} />
        </Routes>
      )}
    </IconProvider>
  );
}

export default App;
