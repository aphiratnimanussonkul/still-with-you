import { afterEach, describe, expect, it, vi } from 'vitest';
import { startMocks, suppressLocationReload, unregisterServiceWorkers } from '@/lib/start-mocks';

function stubServiceWorker(value: unknown) {
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    writable: true,
    value,
  });
}

describe('suppressLocationReload', () => {
  it('does not reload while armed, then restores reload', () => {
    const reload = vi.fn();
    const location = { reload };

    const restore = suppressLocationReload(location);
    location.reload();
    expect(reload).not.toHaveBeenCalled();

    restore();
    location.reload();
    expect(reload).toHaveBeenCalledTimes(1);
  });
});

describe('unregisterServiceWorkers', () => {
  afterEach(() => {
    stubServiceWorker(undefined);
  });

  it('unregisters both the PWA worker and a leftover MSW worker', async () => {
    const pwa = {
      active: { scriptURL: 'https://app.example/sw.js' },
      unregister: vi.fn().mockResolvedValue(true),
    };
    const msw = {
      active: { scriptURL: 'https://app.example/mockServiceWorker.js' },
      unregister: vi.fn().mockResolvedValue(true),
    };
    stubServiceWorker({
      getRegistrations: vi.fn().mockResolvedValue([pwa, msw]),
    });

    await unregisterServiceWorkers();

    expect(pwa.unregister).toHaveBeenCalledTimes(1);
    expect(msw.unregister).toHaveBeenCalledTimes(1);
  });
});

describe('startMocks', () => {
  afterEach(() => {
    stubServiceWorker(undefined);
  });

  it('returns true when the worker starts', async () => {
    stubServiceWorker({
      getRegistrations: vi.fn().mockResolvedValue([]),
    });
    const start = vi.fn().mockResolvedValue(undefined);
    const reload = vi.fn();

    await expect(
      startMocks({ loadWorker: async () => ({ worker: { start } }), location: { reload } })
    ).resolves.toBe(true);
    expect(start).toHaveBeenCalledWith(
      expect.objectContaining({
        onUnhandledRequest: 'bypass',
        serviceWorker: {
          url: '/mockServiceWorker.js',
          options: { updateViaCache: 'none' },
        },
      })
    );
    expect(reload).not.toHaveBeenCalled();
  });

  it('returns false and does not reload when start throws', async () => {
    stubServiceWorker({
      getRegistrations: vi.fn().mockResolvedValue([]),
    });
    const reload = vi.fn();
    const start = vi.fn().mockRejectedValue(new Error('Failed to register a Service Worker'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(
      startMocks({ loadWorker: async () => ({ worker: { start } }), location: { reload } })
    ).resolves.toBe(false);
    expect(reload).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('unregisters a leftover mock worker before start so MSW does not reload', async () => {
    const leftover = {
      active: { scriptURL: 'https://app.example/mockServiceWorker.js' },
      unregister: vi.fn().mockResolvedValue(true),
    };
    stubServiceWorker({
      controller: null,
      getRegistrations: vi.fn().mockResolvedValue([leftover]),
    });
    const reload = vi.fn();
    const location = { reload };
    const start = vi.fn().mockImplementation(async () => {
      location.reload();
    });

    await expect(startMocks({ loadWorker: async () => ({ worker: { start } }), location })).resolves.toBe(
      true
    );
    expect(leftover.unregister).toHaveBeenCalledTimes(1);
    expect(reload).not.toHaveBeenCalled();
  });
});
