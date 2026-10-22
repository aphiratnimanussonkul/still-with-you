import { useEffect, useRef } from 'react';
import { WifiSlashIcon } from '@phosphor-icons/react/WifiSlash';
import { toast } from 'sonner';
import { Icon } from '@/components/ui/icon';
import { copy } from '@/copy';
import { useOnline } from '@/hooks/use-online';

export function OfflineBanner() {
  const online = useOnline();
  const wasOffline = useRef(false);

  useEffect(() => {
    if (!online) {
      wasOffline.current = true;
      return;
    }
    if (wasOffline.current) {
      wasOffline.current = false;
      toast(copy['online.toast']);
    }
  }, [online]);

  if (online) return null;

  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 border-b border-border bg-warning px-4 py-3 text-center text-body text-warning-foreground"
    >
      <Icon as={WifiSlashIcon} size={20} />
      {copy['offline.banner']}
    </div>
  );
}
