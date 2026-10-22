import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PhotoAttachState } from '@/components/PhotoAttach';
import { copy } from '@/copy';
import { mockEvents, mockFamilies } from '@/mocks/data';

const createEvent = vi.fn();
let latestOnStateChange: ((state: PhotoAttachState) => void) | undefined;

vi.mock('@/lib/api-client', () => ({
  api: {
    listFamilies: vi.fn(),
    listEvents: vi.fn(),
    createEvent: (...args: unknown[]) => createEvent(...args),
  },
}));

vi.mock('@/components/Illustration', () => ({
  Illustration: () => <div data-testid="illustration" />,
}));

vi.mock('@/components/PhotoAttach', () => ({
  PhotoAttach: ({
    onStateChange,
  }: {
    onStateChange: (state: PhotoAttachState) => void;
  }) => {
    latestOnStateChange = onStateChange;
    return <div data-testid="photo-attach" />;
  },
}));

import { api } from '@/lib/api-client';
import { MemoriesPage } from '@/pages/MemoriesPage';

const familyId = mockFamilies[0].id;

beforeEach(() => {
  sessionStorage.clear();
  createEvent.mockReset();
  latestOnStateChange = undefined;
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
  it('lists the selected family memories and the add form', async () => {
    vi.mocked(api.listFamilies).mockResolvedValue({ families: mockFamilies });
    vi.mocked(api.listEvents).mockResolvedValue({ events: mockEvents });
    renderPage();
    expect(await screen.findByText('ทริปทะเลกับคุณยาย')).toBeTruthy();
    expect(screen.getByRole('button', { name: copy['memory.filter.paused'] })).toBeTruthy();
    expect(screen.getByLabelText(copy['memory.title_label'])).toBeTruthy();
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
});

describe('MemoriesPage photo attach', () => {
  it('blocks save while uploads are busy, then sends media_ids', async () => {
    vi.mocked(api.listFamilies).mockResolvedValue({ families: mockFamilies });
    vi.mocked(api.listEvents).mockResolvedValue({ events: mockEvents });
    createEvent.mockResolvedValue(mockEvents[0]);

    renderPage();
    expect(await screen.findByLabelText(copy['memory.title_label'])).toBeTruthy();

    fireEvent.change(screen.getByLabelText(copy['memory.title_label']), {
      target: { value: 'ทริปหัวหิน' },
    });
    fireEvent.change(screen.getByLabelText(copy['story.label.required']), {
      target: { value: 'จำได้ว่าทะเลเงียบ' },
    });

    act(() => {
      latestOnStateChange?.({ mediaIds: [], isBusy: true });
    });
    expect(await screen.findByText(copy['photo.upload.wait'])).toBeTruthy();
    expect((screen.getByRole('button', { name: copy['memory.create.submit'] }) as HTMLButtonElement).disabled).toBe(
      true
    );

    const mediaId = '55555555-5555-4555-8555-555555555555';
    act(() => {
      latestOnStateChange?.({ mediaIds: [mediaId], isBusy: false });
    });
    await waitFor(() => {
      expect(
        (screen.getByRole('button', { name: copy['memory.create.submit'] }) as HTMLButtonElement).disabled
      ).toBe(false);
    });

    fireEvent.click(screen.getByRole('button', { name: copy['memory.create.submit'] }));
    await waitFor(() => {
      expect(createEvent).toHaveBeenCalledWith(familyId, {
        title: 'ทริปหัวหิน',
        story: 'จำได้ว่าทะเลเงียบ',
        person_ids: [],
        media_ids: [mediaId],
      });
    });
  });
});
