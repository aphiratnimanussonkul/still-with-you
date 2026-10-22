import { afterEach, describe, expect, it, vi } from 'vitest';
import { startMocks, suppressLocationReload, unregisterNonMswWorkers } from '@/lib/start-mocks';

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

describe('unregisterNonMswWorkers', () => {
  afterEach(() => {
    stubServiceWorker(undefined);
  });

  it('unregisters the PWA worker and leaves the MSW worker', async () => {
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

    await unregisterNonMswWorkers();

    expect(pwa.unregister).toHaveBeenCalledTimes(1);
    expect(msw.unregister).not.toHaveBeenCalled();
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
        serviceWorker: { url: '/mockServiceWorker.js' },
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

  it('swallows an MSW-style reload when a mock worker exists but is not controlling', async () => {
    stubServiceWorker({
      controller: null,
      getRegistrations: vi.fn().mockResolvedValue([
        {
          active: { scriptURL: 'https://app.example/mockServiceWorker.js' },
          unregister: vi.fn().mockResolvedValue(true),
        },
      ]),
    });
    const reload = vi.fn();
    const location = { reload };
    const start = vi.fn().mockImplementation(async () => {
      location.reload();
    });

    await expect(startMocks({ loadWorker: async () => ({ worker: { start } }), location })).resolves.toBe(
      true
    );
    expect(reload).not.toHaveBeenCalled();
  });
});
