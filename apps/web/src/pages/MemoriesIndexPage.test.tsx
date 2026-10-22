import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { copy } from '@/copy';

vi.mock('@/lib/api-client', () => ({
  api: {
    listFamilies: vi.fn(),
    listEvents: vi.fn(),
  },
}));

vi.mock('@/components/Illustration', () => ({
  Illustration: () => <div data-testid="illustration" />,
}));

import { api } from '@/lib/api-client';
import { MemoriesPage } from '@/pages/MemoriesPage';

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <MemoriesPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('MemoriesPage empty family', () => {
  it('shows the memories empty copy when there is no family', async () => {
    vi.mocked(api.listFamilies).mockResolvedValue({ families: [] });
    renderPage();
    expect(await screen.findByText(copy['memory.empty.title'])).toBeTruthy();
    expect(screen.getByText(copy['family.empty.body'])).toBeTruthy();
  });
});
