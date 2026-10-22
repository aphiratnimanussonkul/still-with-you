import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { copy } from '@/copy';
import { mockEvents, mockFamilies } from '@/mocks/data';

vi.mock('@/lib/api-client', () => ({
  api: {
    listFamilies: vi.fn(),
  },
}));

vi.mock('@/lib/home-api', () => ({
  homeApi: {
    getHome: vi.fn(),
  },
}));

vi.mock('@/hooks/use-me', () => ({
  useMe: () => ({
    data: { display_name: 'Atta', email: 'atta@example.com' },
  }),
}));

vi.mock('@/components/Illustration', () => ({
  Illustration: () => <div data-testid="illustration" />,
}));

import { api } from '@/lib/api-client';
import { homeApi } from '@/lib/home-api';
import { HomePage } from '@/pages/HomePage';

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('HomePage', () => {
  it('shows greeting, focus, question, recent memories, and start-new-memory', async () => {
    vi.mocked(api.listFamilies).mockResolvedValue({ families: mockFamilies });
    vi.mocked(homeApi.getHome).mockResolvedValue({
      focus: [
        {
          person: { id: '77777777-7777-4777-8777-777777777777', name: 'ยายสมศรี' },
          photo_url: null,
          memory_count: 2,
        },
      ],
      quick_question: {
        question_id: 'q-1',
        person_id: '77777777-7777-4777-8777-777777777777',
        text: 'ยายสมศรี เกิดที่ไหน',
      },
      recent_memories: [mockEvents[0]],
    });

    renderPage();
    expect(await screen.findByText(copy['home.focus.title'])).toBeTruthy();
    expect(screen.getByText(copy['home.focus.see_all'])).toBeTruthy();
    expect(screen.getByText(copy['home.question.title'])).toBeTruthy();
    expect(screen.getByRole('button', { name: copy['home.question.save'] })).toBeTruthy();
    expect(screen.getByRole('button', { name: copy['home.question.skip'] })).toBeTruthy();
    expect(screen.getByRole('link', { name: copy['memory.create.action'] })).toBeTruthy();
    expect(screen.getByText('ทริปทะเลกับคุณยาย')).toBeTruthy();
    expect(screen.getByLabelText(copy['family.switcher'])).toBeTruthy();
  });
});
