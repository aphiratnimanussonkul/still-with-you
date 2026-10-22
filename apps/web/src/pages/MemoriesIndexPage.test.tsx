import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { copy } from '@/copy';
import { MemoriesIndexPage } from '@/pages/MemoriesIndexPage';

vi.mock('@/lib/api-client', () => ({
  api: {
    listFamilies: vi.fn(),
  },
}));

vi.mock('@/components/Illustration', () => ({
  Illustration: () => <div data-testid="illustration" />,
}));

import { api } from '@/lib/api-client';

function renderIndex() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/memories']}>
        <Routes>
          <Route path="/memories" element={<MemoriesIndexPage />} />
          <Route path="/families/:familyId" element={<p>family-detail</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('MemoriesIndexPage', () => {
  it('shows the memories empty copy when there is no family', async () => {
    vi.mocked(api.listFamilies).mockResolvedValue({ families: [] });
    renderIndex();
    expect(await screen.findByText(copy['memories.empty.title'])).toBeTruthy();
    expect(screen.getByText(copy['memories.empty.body'])).toBeTruthy();
  });

  it('redirects to the first family when one exists', async () => {
    vi.mocked(api.listFamilies).mockResolvedValue({
      families: [
        {
          id: '22222222-2222-4222-8222-222222222222',
          name: 'บ้านเรา',
          created_by: '11111111-1111-4111-8111-111111111111',
          created_at: '2026-10-02T00:00:00.000Z',
        },
      ],
    });
    renderIndex();
    await waitFor(() => {
      expect(screen.getByText('family-detail')).toBeTruthy();
    });
  });
});
