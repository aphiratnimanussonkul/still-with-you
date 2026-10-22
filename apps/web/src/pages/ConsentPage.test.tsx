import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { copy, interpolateHeading, pageHeadingClassName } from '@/copy';
import { ConsentPage } from '@/pages/ConsentPage';

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({
    session: { access_token: 'tok' },
    loading: false,
    signInWithGoogle: vi.fn(),
    signOut: vi.fn(),
  }),
}));

vi.mock('@/hooks/use-me', () => ({
  useMe: () => ({
    isPending: false,
    isError: false,
    data: {
      display_name: 'Aphirat Nimanussonkul',
      email: 'aphirat@example.com',
      marketing_consent: false,
      marketing_consent_at: null,
    },
  }),
  isFirstUse: () => true,
}));

vi.mock('@/components/Illustration', () => ({
  Illustration: () => <div data-testid="illustration" />,
}));

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ConsentPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('ConsentPage heading', () => {
  it('shows the full welcome name and lets the h1 wrap instead of truncating', () => {
    renderPage();
    const heading = screen.getByRole('heading', {
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
