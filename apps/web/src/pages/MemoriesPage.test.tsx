import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { PhotoAttachState } from '@/components/PhotoAttach';
import { copy } from '@/copy';
import { mockEvents, mockFamilies } from '@/mocks/data';

const createEvent = vi.fn();
let latestOnStateChange: ((state: PhotoAttachState) => void) | undefined;

vi.mock('@/lib/api-client', () => ({
  api: {
    getFamily: vi.fn(),
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

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/families/${familyId}`]}>
        <Routes>
          <Route path="/families/:familyId" element={<MemoriesPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('MemoriesPage photo attach', () => {
  it('blocks save while uploads are busy, then sends media_ids', async () => {
    vi.mocked(api.getFamily).mockResolvedValue(mockFamilies[0]);
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
