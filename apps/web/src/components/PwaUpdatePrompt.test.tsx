import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { copy } from '@/copy';
import { MEMORY_CREATE_DRAFT_KEY, PWA_UPDATE_CHECK_MS, readDraft } from '@/lib/form-draft';
import {
  emitNeedRefresh,
  emitRegisteredSW,
  pwaRegisterOptions,
  resetPwaRegisterStub,
  updateServiceWorker,
} from '@/test/pwa-register-stub';
import { PwaUpdatePrompt } from '@/components/PwaUpdatePrompt';

vi.mock('@/lib/env', () => ({
  env: { useMsw: false },
}));

async function waitForRegister(): Promise<void> {
  await waitFor(() => {
    expect(pwaRegisterOptions()?.onNeedRefresh).toBeTypeOf('function');
  });
}

describe('PwaUpdatePrompt', () => {
  beforeEach(() => {
    resetPwaRegisterStub();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows Eddy app.update copy and calls updateServiceWorker(true) after flushing drafts', async () => {
    render(<PwaUpdatePrompt />);
    await waitForRegister();
    act(() => {
      emitNeedRefresh();
    });
    expect(await screen.findByText(copy['app.update.body'])).toBeTruthy();
    expect(screen.getByRole('button', { name: copy['app.update.action'] })).toBeTruthy();

    const onFlush = () => {
      sessionStorage.setItem(
        MEMORY_CREATE_DRAFT_KEY,
        JSON.stringify({ title: 'ร่างก่อนเปิดใหม่', story: 'ยังอยู่' })
      );
    };
    window.addEventListener('swy:pwa-flush-drafts', onFlush);
    fireEvent.click(screen.getByRole('button', { name: copy['app.update.action'] }));
    window.removeEventListener('swy:pwa-flush-drafts', onFlush);
    expect(readDraft(MEMORY_CREATE_DRAFT_KEY)).toEqual({ title: 'ร่างก่อนเปิดใหม่', story: 'ยังอยู่' });
    expect(updateServiceWorker).toHaveBeenCalledWith(true);
  });

  it('checks for a new SW on an interval and when the tab becomes visible', async () => {
    render(<PwaUpdatePrompt />);
    await waitForRegister();
    vi.useFakeTimers();
    const registration = { update: vi.fn(async () => undefined) } as unknown as ServiceWorkerRegistration;
    act(() => {
      emitRegisteredSW(registration);
    });

    expect(registration.update).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(PWA_UPDATE_CHECK_MS);
    });
    expect(registration.update).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(registration.update).toHaveBeenCalledTimes(2);
  });
});
