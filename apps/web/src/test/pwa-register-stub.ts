export function registerSW(_options?: {
  immediate?: boolean;
  onNeedRefresh?: () => void;
}): (reloadPage?: boolean) => Promise<void> {
  return async () => undefined;
}
