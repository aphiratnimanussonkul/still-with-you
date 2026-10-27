import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorCode } from '@still-with-you/contracts';
import { copy, interpolate } from '@/copy';
import { ApiClientError } from '@/lib/api-errors';
import { mockEvents, mockFamilies, mockPeople } from '@/mocks/data';

vi.mock('@/lib/api-client', () => ({
  api: {
    listFamilies: vi.fn(),
    listEvents: vi.fn(),
  },
}));

vi.mock('sonner', () => {
  const toast = Object.assign(vi.fn(), { success: vi.fn() });
  return { toast };
});

vi.mock('@/lib/home-api', () => ({
  FOCUS_MAX: 10,
  homeApi: {
    getHome: vi.fn(),
    answerFact: vi.fn(),
    skipFact: vi.fn(),
    updateFact: vi.fn(),
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

import { toast } from 'sonner';
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

const homeQuestionId = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001';

const homePayload = {
  focus: [
    {
      person: {
        id: mockPeople[0].id,
        display_name: mockPeople[0].display_name,
        name: mockPeople[0].name,
      },
      photo_url: 'https://cdn.example.com/yay.jpg',
      avatar_url: 'https://cdn.example.com/yay.jpg',
      avatar_placeholder: null,
      full_url: 'https://cdn.example.com/yay-full.jpg',
      memory_count: 2,
      position: 0,
    },
    {
      person: {
        id: mockPeople[1].id,
        display_name: mockPeople[1].display_name,
        name: mockPeople[1].name,
      },
      photo_url: null,
      avatar_url: null,
      avatar_placeholder: null,
      full_url: null,
      memory_count: 1,
      position: 1,
    },
  ],
  quick_question: {
    question_id: homeQuestionId,
    key: 'birthplace',
    person: {
      id: mockPeople[0].id,
      display_name: mockPeople[0].display_name,
      name: mockPeople[0].name,
    },
    text: 'ยายสมศรี เกิดที่ไหน',
  },
  recent_memories: [mockEvents[0]],
};

describe('HomePage', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.mocked(toast).mockClear();
    vi.mocked(toast.success).mockClear();
  });

  it('shows greeting, focus photos, question, recent memories, and start-new-memory', async () => {
    vi.mocked(api.listFamilies).mockResolvedValue({ families: mockFamilies });
    vi.mocked(api.listEvents).mockResolvedValue({ events: mockEvents });
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

  it('keeps greeting and memories when /home fails, and hides the question', async () => {
    vi.mocked(api.listFamilies).mockResolvedValue({ families: mockFamilies });
    vi.mocked(api.listEvents).mockResolvedValue({ events: mockEvents });
    vi.mocked(homeApi.getHome).mockRejectedValue(new ApiClientError('GENERIC', 'Route not found', 404));

    renderPage();
    expect(
      await screen.findByText(interpolate(copy['welcome.title'], { ชื่อ: 'Atta' }))
    ).toBeTruthy();
    expect(await screen.findByText('ทริปทะเลกับคุณยาย')).toBeTruthy();
    expect(screen.getByRole('link', { name: copy['memory.create.action'] })).toBeTruthy();
    expect(screen.queryByText(copy['home.question.title'])).toBeNull();
    expect(screen.getByText(copy['error.generic'])).toBeTruthy();
  });

  it('shows the focus invite card and hides the question when focus is empty', async () => {
    vi.mocked(api.listFamilies).mockResolvedValue({ families: mockFamilies });
    vi.mocked(api.listEvents).mockResolvedValue({ events: mockEvents });
    vi.mocked(homeApi.getHome).mockResolvedValue({
      ...homePayload,
      focus: [],
      quick_question: homePayload.quick_question,
    });

    renderPage();
    expect(await screen.findByText(copy['home.focus.invite.title'])).toBeTruthy();
    expect(screen.getByText(copy['home.focus.invite.body'])).toBeTruthy();
    expect(screen.getByRole('link', { name: copy['home.focus.invite.action'] }).getAttribute('href')).toBe(
      '/family'
    );
    expect(screen.queryByText(copy['home.question.title'])).toBeNull();
  });

  it('saves a Quick Question answer as a person fact, not a memory', async () => {
    vi.mocked(api.listFamilies).mockResolvedValue({ families: mockFamilies });
    vi.mocked(api.listEvents).mockResolvedValue({ events: mockEvents });
    vi.mocked(homeApi.getHome).mockResolvedValue(homePayload);
    vi.mocked(homeApi.answerFact).mockResolvedValue({
      question_id: homeQuestionId,
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
        question_id: homeQuestionId,
        answer_text: 'อยุธยา',
      })
    );
    expect(toast.success).toHaveBeenCalledWith(copy['home.question.saved.toast']);
  });

  it('toasts after skipping a question', async () => {
    vi.mocked(api.listFamilies).mockResolvedValue({ families: mockFamilies });
    vi.mocked(api.listEvents).mockResolvedValue({ events: mockEvents });
    vi.mocked(homeApi.getHome).mockResolvedValue(homePayload);
    vi.mocked(homeApi.skipFact).mockResolvedValue({ skipped: true });

    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: copy['home.question.skip'] }));
    await waitFor(() => expect(homeApi.skipFact).toHaveBeenCalledWith(mockPeople[0].id, homeQuestionId));
    expect(toast).toHaveBeenCalledWith(copy['home.question.skipped.toast']);
  });

  it('offers to edit the existing answer when ALREADY_ANSWERED', async () => {
    vi.mocked(api.listFamilies).mockResolvedValue({ families: mockFamilies });
    vi.mocked(api.listEvents).mockResolvedValue({ events: mockEvents });
    vi.mocked(homeApi.getHome).mockResolvedValue(homePayload);
    vi.mocked(homeApi.answerFact).mockRejectedValue(
      new ApiClientError(ErrorCode.ALREADY_ANSWERED, 'already', 409, undefined, { fact_id: 'fact-1' })
    );
    vi.mocked(homeApi.updateFact).mockResolvedValue({
      question_id: homeQuestionId,
      answer_text: 'อยุธยา',
    });

    renderPage();
    const input = await screen.findByLabelText('ยายสมศรี เกิดที่ไหน');
    fireEvent.change(input, { target: { value: 'อยุธยา' } });
    fireEvent.click(screen.getByRole('button', { name: copy['home.question.save'] }));

    expect(await screen.findByText(copy['error.ALREADY_ANSWERED'])).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: copy['home.question.already_answered.action'] }));
    await waitFor(() => expect(homeApi.updateFact).toHaveBeenCalledWith('fact-1', 'อยุธยา'));
    expect(toast.success).toHaveBeenCalledWith(copy['home.question.saved.toast']);
  });
});
