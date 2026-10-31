import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccountResponse } from '@still-with-you/contracts';
import { copy, interpolateHeading, pageHeadingClassName } from '@/copy';
import { ConsentPage } from '@/pages/ConsentPage';

const unanswered: AccountResponse = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'atta@example.com',
  display_name: 'Atta',
  marketing_consent: false,
  marketing_consent_at: null,
  consent_answered_at: null,
  created_at: '2026-10-01T00:00:00.000Z',
};

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({
    session: { access_token: 'tok' },
    loading: false,
    signInWithGoogle: vi.fn(),
    signOut: vi.fn(),
  }),
}));

vi.mock('@/lib/api-client', () => ({
  api: {
    getMe: vi.fn(),
    updateConsent: vi.fn(),
  },
}));

vi.mock('@/components/Illustration', () => ({
  Illustration: () => <div data-testid="illustration" />,
}));

import { api } from '@/lib/api-client';

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/consent']}>
        <Routes>
          <Route path="/consent" element={<ConsentPage />} />
          <Route path="/home" element={<p>home</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('ConsentPage heading', () => {
  it('shows the full welcome name and lets the h1 wrap instead of truncating', async () => {
    vi.mocked(api.getMe).mockResolvedValue({
      ...unanswered,
      display_name: 'Aphirat Nimanussonkul',
      email: 'aphirat@example.com',
    });
    renderPage();
    const heading = await screen.findByRole('heading', {
      name: interpolateHeading(copy['welcome.title'], { ชื่อ: 'Aphirat Nimanussonkul' }),
    });
    expect(heading.tagName).toBe('H1');
    expect(heading.textContent).toBe('ยินดีต้อนรับ Aphirat Nimanussonkul');
    expect(heading.textContent).not.toContain('…');
    expect(heading.className).toContain('break-words');
    expect(heading.className).toContain('line-clamp-2');
    expect(pageHeadingClassName).toContain('break-words');
    expect(pageHeadingClassName).toContain('line-clamp-2');
  });
});

describe('ConsentPage submit', () => {
  beforeEach(() => {
    vi.mocked(api.getMe).mockResolvedValue(unanswered);
    vi.mocked(api.updateConsent).mockReset();
  });

  it('sends PATCH on the first ไปต่อ click even when marketing is declined', async () => {
    const answered: AccountResponse = {
      ...unanswered,
      marketing_consent: false,
      consent_answered_at: '2026-10-22T00:00:00.000Z',
    };
    vi.mocked(api.updateConsent).mockResolvedValue(answered);
    vi.mocked(api.getMe).mockResolvedValueOnce(unanswered).mockResolvedValue(answered);

    renderPage();
    const submit = await screen.findByRole('button', { name: copy['consent.continue'] });
    fireEvent.click(submit);

    await waitFor(() => {
      expect(api.updateConsent).toHaveBeenCalledTimes(1);
    });
    expect(api.updateConsent).toHaveBeenCalledWith({ marketing_consent: false });
    expect(await screen.findByText('home')).toBeTruthy();
  });

  it('shows error copy when the PATCH fails and stays on consent', async () => {
    vi.mocked(api.updateConsent).mockRejectedValue(new Error('boom'));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: copy['consent.continue'] }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText(copy['error.unknown'])).toBeTruthy();
    expect(screen.getByRole('button', { name: copy['consent.continue'] })).toBeTruthy();
    expect(api.updateConsent).toHaveBeenCalledTimes(1);
  });

  it('shows a spinner on ไปต่อ while consent is saving', async () => {
    let resolveConsent: (value: AccountResponse) => void = () => undefined;
    vi.mocked(api.updateConsent).mockReturnValue(
      new Promise((resolve) => {
        resolveConsent = resolve;
      })
    );
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: copy['consent.continue'] }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: copy['consent.continue'] }).getAttribute('aria-busy')).toBe(
        'true'
      );
    });
    resolveConsent({
      ...unanswered,
      consent_answered_at: '2026-10-22T00:00:00.000Z',
    });
    expect(await screen.findByText('home')).toBeTruthy();
  });
});
