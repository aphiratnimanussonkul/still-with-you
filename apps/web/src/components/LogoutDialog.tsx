import { Button } from '@/components/ui/button';
import { copy } from '@/copy';
import { useAuth } from '@/hooks/use-auth';

export function LogoutDialog({ onClose }: { onClose: () => void }) {
  const { signOut } = useAuth();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="logout-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4"
    >
      <div className="w-full max-w-sm rounded-xl bg-card p-6 shadow-e3">
        <h2 id="logout-title" className="text-h2 font-semibold">
          {copy['logout.confirm.title']}
        </h2>
        <p className="mt-3 text-body text-muted-foreground">{copy['logout.confirm.body']}</p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={onClose}>
            {copy['common.cancel']}
          </Button>
          <Button
            type="button"
            onClick={() => {
              onClose();
              void signOut();
            }}
          >
            {copy['logout.confirm.primary']}
          </Button>
        </div>
      </div>
    </div>
  );
}
