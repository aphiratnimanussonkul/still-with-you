import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { copy } from '@/copy';
import { ApiClientError } from '@/lib/api-errors';
import { mockEvents, mockFamilies } from '@/mocks/data';

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

beforeEach(() => {
  sessionStorage.clear();
});

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

describe('MemoriesPage', () => {
  it('lists the selected family memories and links to create', async () => {
    vi.mocked(api.listFamilies).mockResolvedValue({ families: mockFamilies });
    vi.mocked(api.listEvents).mockResolvedValue({ events: mockEvents });
    renderPage();
    expect(await screen.findByText('ทริปทะเลกับคุณยาย')).toBeTruthy();
    expect(screen.getByRole('button', { name: copy['memory.filter.paused'] })).toBeTruthy();
    expect(screen.getByRole('link', { name: copy['memory.create.action'] }).getAttribute('href')).toBe(
      '/memories/new'
    );
    expect(screen.queryByLabelText(copy['memory.title_label'])).toBeNull();
    expect(screen.getByRole('link', { name: /ทริปทะเลกับคุณยาย/ }).getAttribute('href')).toBe(
      `/memories/${mockEvents[0].id}`
    );
  });

  it('filters paused memories for the selected family only', async () => {
    const otherPaused = {
      ...mockEvents[1],
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      family_id: mockFamilies[1].id,
      title: 'พักไว้ที่บ้านคุณยาย',
    };
    vi.mocked(api.listFamilies).mockResolvedValue({ families: mockFamilies });
    vi.mocked(api.listEvents).mockImplementation(async (familyId: string) => ({
      events: familyId === mockFamilies[1].id ? [otherPaused] : mockEvents,
    }));

    renderPage();
    expect(await screen.findByText('ทริปทะเลกับคุณยาย')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: copy['memory.filter.paused'] }));
    expect(await screen.findByText('วันเกิดยาย')).toBeTruthy();
    expect(screen.queryByText('ทริปทะเลกับคุณยาย')).toBeNull();

    fireEvent.change(screen.getByLabelText(copy['family.switcher']), {
      target: { value: mockFamilies[1].id },
    });
    expect(await screen.findByText('พักไว้ที่บ้านคุณยาย')).toBeTruthy();
    expect(screen.queryByText('วันเกิดยาย')).toBeNull();
  });

  it('keeps the switcher and create link when the list fails to load', async () => {
    vi.mocked(api.listFamilies).mockResolvedValue({ families: mockFamilies });
    vi.mocked(api.listEvents).mockRejectedValue(new ApiClientError('GENERIC', 'Route not found', 404));

    renderPage();
    expect(await screen.findByLabelText(copy['family.switcher'])).toBeTruthy();
    expect(await screen.findByText(copy['memory.stories.load_error'])).toBeTruthy();
    expect(screen.getByRole('button', { name: copy['memory.stories.retry'] })).toBeTruthy();
    expect(screen.getByRole('link', { name: copy['memory.create.action'] }).getAttribute('href')).toBe(
      '/memories/new'
    );
    expect(screen.queryByLabelText(copy['memory.title_label'])).toBeNull();
  });
});
