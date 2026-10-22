import { Navigate, Route, Routes } from 'react-router-dom';
import { OfflineScreen } from '@/components/OfflineScreen';
import { QueryLoading } from '@/components/QueryLoading';
import { useAuth } from '@/hooks/use-auth';
import { useOnline } from '@/hooks/use-online';
import { ConsentPage } from '@/pages/ConsentPage';
import { FamiliesPage } from '@/pages/FamiliesPage';
import { LoginPage } from '@/pages/LoginPage';
import { MemoriesPage } from '@/pages/MemoriesPage';
import { RequireSession } from '@/pages/RequireSession';

export function App() {
  const online = useOnline();
  const { session, loading } = useAuth();

  if (!online) {
    return <OfflineScreen />;
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <QueryLoading />
      </div>
    );
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={session ? <Navigate to="/families" replace /> : <LoginPage />}
      />
      <Route element={<RequireSession />}>
        <Route path="/consent" element={<ConsentPage />} />
        <Route path="/families" element={<FamiliesPage />} />
        <Route path="/families/:familyId" element={<MemoriesPage />} />
      </Route>
      <Route path="/" element={<Navigate to={session ? '/families' : '/login'} replace />} />
      <Route path="*" element={<Navigate to={session ? '/families' : '/login'} replace />} />
    </Routes>
  );
}

export default App;
