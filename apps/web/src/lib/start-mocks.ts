const MSW_WORKER_FILE = 'mockServiceWorker.js';
const MSW_START_TIMEOUT_MS = 4_000;

type StartableWorker = {
  start: (options: {
    onUnhandledRequest: 'bypass';
    quiet: boolean;
    serviceWorker: { url: string };
  }) => Promise<unknown>;
};

export type ReloadableLocation = {
  reload: (...args: unknown[]) => unknown;
};

export type StartMocksOptions = {
  loadWorker?: () => Promise<{ worker: StartableWorker }>;
  location?: ReloadableLocation;
};

function mockWorkerUrl(): string {
  const base = import.meta.env.BASE_URL.endsWith('/')
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`;
  return `${base}${MSW_WORKER_FILE}`;
}

function isMswWorkerScript(scriptUrl: string): boolean {
  return scriptUrl.endsWith(`/${MSW_WORKER_FILE}`) || scriptUrl.endsWith(MSW_WORKER_FILE);
}

/**
 * MSW calls location.reload() when a mock worker is registered but not yet
 * controlling the page. That fights vite-plugin-pwa's sw.js and loops on
 * Cloudflare Pages. Swallow reloads only for the duration of start().
 */
export function suppressLocationReload(location: ReloadableLocation = window.location): () => void {
  const original = location.reload.bind(location);
  let active = true;

  const guarded = ((..._args: unknown[]) => {
    if (active) return undefined;
    return original();
  }) as typeof location.reload;

  try {
    Object.defineProperty(location, 'reload', {
      configurable: true,
      writable: true,
      value: guarded,
    });
  } catch {
    try {
      location.reload = guarded;
    } catch {
      // Some browsers freeze Location#reload; unregistering the PWA worker is the real fix.
    }
  }

  return () => {
    active = false;
    try {
      Object.defineProperty(location, 'reload', {
        configurable: true,
        writable: true,
        value: original,
      });
    } catch {
      try {
        location.reload = original;
      } catch {
        // ignore
      }
    }
  };
}

export async function unregisterNonMswWorkers(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;

  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(
    registrations.map(async (registration) => {
      const script =
        registration.active?.scriptURL ??
        registration.waiting?.scriptURL ??
        registration.installing?.scriptURL ??
        '';
      if (!script || isMswWorkerScript(script)) return;
      await registration.unregister();
    })
  );
}

async function startWithTimeout(worker: StartableWorker): Promise<void> {
  let timeoutId = 0;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => {
      reject(new Error('MSW start timed out'));
    }, MSW_START_TIMEOUT_MS);
  });

  try {
    await Promise.race([
      worker.start({
        onUnhandledRequest: 'bypass',
        quiet: true,
        serviceWorker: { url: mockWorkerUrl() },
      }),
      timeout,
    ]);
  } finally {
    window.clearTimeout(timeoutId);
  }
}

/**
 * Start MSW for production/dev when VITE_USE_MSW=true.
 * Never throws and never leaves a reload loop if the worker fails.
 */
export async function startMocks({
  loadWorker = () => import('@/mocks/browser'),
  location = window.location,
}: StartMocksOptions = {}): Promise<boolean> {
  if (!('serviceWorker' in navigator)) {
    return false;
  }

  const restoreReload = suppressLocationReload(location);
  try {
    await unregisterNonMswWorkers();
    const { worker } = await loadWorker();
    await startWithTimeout(worker);
    return true;
  } catch (error) {
    console.warn('MSW failed to start; continuing without mocks', error);
    return false;
  } finally {
    restoreReload();
  }
}
