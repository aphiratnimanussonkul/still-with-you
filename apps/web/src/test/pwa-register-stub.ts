import { vi } from 'vitest';

type RegisterSWOptions = {
  immediate?: boolean;
  onNeedRefresh?: () => void;
  onRegisteredSW?: (swUrl: string, registration?: ServiceWorkerRegistration) => void;
};

let options: RegisterSWOptions | undefined;

export const updateServiceWorker = vi.fn(async (_reloadPage?: boolean) => undefined);

export function registerSW(next: RegisterSWOptions = {}): (reloadPage?: boolean) => Promise<void> {
  options = next;
  return (reloadPage?: boolean) => updateServiceWorker(reloadPage);
}

export function pwaRegisterOptions(): RegisterSWOptions | undefined {
  return options;
}

export function emitNeedRefresh(): void {
  options?.onNeedRefresh?.();
}

export function emitRegisteredSW(registration?: ServiceWorkerRegistration): void {
  options?.onRegisteredSW?.('/sw.js', registration);
}

export function resetPwaRegisterStub(): void {
  options = undefined;
  updateServiceWorker.mockReset();
  updateServiceWorker.mockResolvedValue(undefined);
}
