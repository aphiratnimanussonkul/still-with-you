import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { copy } from '@/copy';
import { SettingsPage } from '@/pages/SettingsPage';

const signOut = vi.fn();

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({
    session: { access_token: 'tok' },
    loading: false,
    signInWithGoogle: vi.fn(),
    signOut,
  }),
}));

vi.mock('@/hooks/use-me', () => ({
  useMe: () => ({
    isPending: false,
    isError: false,
    data: {
      display_name: 'Atta',
      email: 'atta@example.com',
      marketing_consent: false,
      marketing_consent_at: '2026-01-01T00:00:00.000Z',
      consent_answered_at: '2026-01-01T00:00:00.000Z',
    },
  }),
}));

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('SettingsPage', () => {
  it('moves logout into settings and opens the confirm dialog', () => {
    renderPage();
    expect(screen.getByText(copy['settings.account.title'])).toBeTruthy();
    expect(screen.getByText(copy['settings.consent.toggle'])).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: copy['logout.action'] }));
    const dialog = screen.getByRole('dialog', { name: copy['logout.confirm.title'] });
    expect(within(dialog).getByRole('button', { name: copy['common.cancel'] })).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: copy['logout.confirm.primary'] }));
    expect(signOut).toHaveBeenCalled();
  });
});
