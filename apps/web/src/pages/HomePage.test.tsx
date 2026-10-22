import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { copy, interpolate } from '@/copy';
import { mockEvents, mockFamilies, mockPeople } from '@/mocks/data';

vi.mock('@/lib/api-client', () => ({
  api: {
    listFamilies: vi.fn(),
  },
}));

vi.mock('@/lib/home-api', () => ({
  FOCUS_MAX: 10,
  homeApi: {
    getHome: vi.fn(),
    answerFact: vi.fn(),
    skipFact: vi.fn(),
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

const homePayload = {
  focus: [
    {
      person: { id: mockPeople[0].id, name: mockPeople[0].name },
      photo_url: 'https://cdn.example.com/yay.jpg',
      memory_count: 2,
    },
    {
      person: { id: mockPeople[1].id, name: mockPeople[1].name },
      photo_url: null,
      memory_count: 1,
    },
  ],
  quick_question: {
    question_id: 'q-1',
    person_id: mockPeople[0].id,
    text: 'ยายสมศรี เกิดที่ไหน',
  },
  recent_memories: [mockEvents[0]],
};

describe('HomePage', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('shows greeting, focus photos, question, recent memories, and start-new-memory', async () => {
    vi.mocked(api.listFamilies).mockResolvedValue({ families: mockFamilies });
    vi.mocked(homeApi.getHome).mockResolvedValue(homePayload);

    renderPage();
    expect(
      await screen.findByText(interpolate(copy['welcome.title'], { ชื่อ: 'Atta' }))
    ).toBeTruthy();
    expect(await screen.findByText(copy['home.focus.title'])).toBeTruthy();
    expect(screen.getByText(copy['home.focus.see_all'])).toBeTruthy();
    expect(screen.getByAltText('ยายสมศรี').getAttribute('src')).toBe('https://cdn.example.com/yay.jpg');
    expect(screen.getByAltText('ปู่สมชาย')).toBeTruthy();
    expect(screen.getByText(interpolate(copy['person.memories.title'], { จำนวน: '2' }))).toBeTruthy();
    expect(screen.getByText(copy['home.question.title'])).toBeTruthy();
    expect(screen.getByLabelText('ยายสมศรี เกิดที่ไหน')).toBeTruthy();
    expect(screen.getByRole('button', { name: copy['home.question.save'] })).toBeTruthy();
    expect(screen.getByRole('button', { name: copy['home.question.skip'] })).toBeTruthy();
    expect(screen.getByRole('link', { name: copy['memory.create.action'] })).toBeTruthy();
    expect(screen.getByText('ทริปทะเลกับคุณยาย')).toBeTruthy();
    expect(screen.getByLabelText(copy['family.switcher'])).toBeTruthy();
  });

  it('saves a Quick Question answer as a person fact, not a memory', async () => {
    vi.mocked(api.listFamilies).mockResolvedValue({ families: mockFamilies });
    vi.mocked(homeApi.getHome).mockResolvedValue(homePayload);
    vi.mocked(homeApi.answerFact).mockResolvedValue({
      question_id: 'q-1',
      answer_text: 'อยุธยา',
    });

    renderPage();
    const input = await screen.findByLabelText('ยายสมศรี เกิดที่ไหน');
    fireEvent.change(input, { target: { value: 'อยุธยา' } });
    const save = screen.getByRole('button', { name: copy['home.question.save'] });
    await waitFor(() => expect(save.hasAttribute('disabled')).toBe(false));
    fireEvent.click(save);

    await waitFor(() =>
      expect(homeApi.answerFact).toHaveBeenCalledWith(mockPeople[0].id, {
        question_id: 'q-1',
        answer_text: 'อยุธยา',
      })
    );
  });
});
