import { Link } from 'react-router-dom';
import { SettingsPage } from '@/pages/SettingsPage';
import { Button } from '@/components/ui/button';
import { copy } from '@/copy';

export function MePage() {
  return (
    <div className="flex flex-col gap-6">
      <SettingsPage />
      <Button variant="outline" asChild>
        <Link to="/me/trash">{copy['nav.trash']}</Link>
      </Button>
    </div>
  );
}
