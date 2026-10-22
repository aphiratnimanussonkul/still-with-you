import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { copy } from '@/copy';
import { ApiClientError } from '@/lib/api-errors';
import { mockEvents } from '@/mocks/data';

vi.mock('@/lib/api-client', () => ({
  api: {
    getEvent: vi.fn(),
  },
}));

vi.mock('@/lib/family-graph', () => ({
  familyGraph: {
    listContributions: vi.fn(),
    createContribution: vi.fn(),
  },
}));

import { api } from '@/lib/api-client';
import { familyGraph } from '@/lib/family-graph';
import { MemoryDetailPage } from '@/pages/MemoryDetailPage';

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/memories/${mockEvents[0].id}`]}>
        <Routes>
          <Route path="/memories/:eventId" element={<MemoryDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('MemoryDetailPage stories isolation', () => {
  it('keeps the memory and add-story form when stories fail to load', async () => {
    vi.mocked(api.getEvent).mockResolvedValue(mockEvents[0]);
    vi.mocked(familyGraph.listContributions).mockRejectedValue(
      new ApiClientError('GENERIC', 'Route not found', 404)
    );

    renderPage();
    expect(await screen.findByRole('heading', { name: 'ทริปทะเลกับคุณยาย' })).toBeTruthy();
    expect(screen.getByText(copy['memory.stories.load_error'])).toBeTruthy();
    expect(screen.getByRole('button', { name: copy['memory.stories.retry'] })).toBeTruthy();
    expect(screen.getByLabelText(copy['story.label.required'])).toBeTruthy();
    expect(screen.queryByText(copy['error.INTERNAL_ERROR'])).toBeNull();
  });
});
