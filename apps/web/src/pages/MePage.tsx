import { Link } from 'react-router-dom';
import { NotificationsList } from '@/components/NotificationsList';
import { Button } from '@/components/ui/button';
import { copy } from '@/copy';
import { SettingsPage } from '@/pages/SettingsPage';

export function MePage() {
  return (
    <div className="flex flex-col gap-6">
      <NotificationsList />
      <SettingsPage />
      <Button variant="outline" asChild>
        <Link to="/me/trash">{copy['nav.trash']}</Link>
      </Button>
    </div>
  );
}
