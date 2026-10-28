import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Link, RouterProvider, createMemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PhotoAttachState } from '@/components/PhotoAttach';
import { copy, interpolate } from '@/copy';
import { ApiClientError } from '@/lib/api-errors';
import { mockContributions, mockEvents } from '@/mocks/data';

const createContribution = vi.fn();
let latestOnStateChange: ((state: PhotoAttachState) => void) | undefined;

vi.mock('@/lib/api-client', () => ({
  api: {
    getEvent: vi.fn(),
  },
}));

vi.mock('@/lib/family-graph', () => ({
  familyGraph: {
    listContributions: vi.fn(),
    createContribution: (...args: unknown[]) => createContribution(...args),
  },
}));

vi.mock('sonner', () => {
  const toast = Object.assign(vi.fn(), { success: vi.fn() });
  return { toast };
});

vi.mock('@/components/PhotoAttach', () => ({
  PhotoAttach: ({
    label,
    onStateChange,
  }: {
    label?: string;
    onStateChange: (state: PhotoAttachState) => void;
  }) => {
    latestOnStateChange = onStateChange;
    return <div data-testid="photo-attach">{label}</div>;
  },
}));

import { api } from '@/lib/api-client';
import { familyGraph } from '@/lib/family-graph';
import { toast } from 'sonner';
import { MemoryDetailPage } from '@/pages/MemoryDetailPage';

function renderPage(path = `/memories/${mockEvents[0].id}`) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [
      {
        path: '/memories/:eventId',
        element: (
          <>
            <Link to="/memories">leave-memory</Link>
            <MemoryDetailPage />
          </>
        ),
      },
      { path: '/memories', element: <p>memories-list</p> },
      { path: '/home', element: <p>home-page</p> },
    ],
    { initialEntries: [path] }
  );
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}

describe('MemoryDetailPage stories isolation', () => {
  beforeEach(() => {
    createContribution.mockReset();
    latestOnStateChange = undefined;
  });

  it('keeps the memory and add-story action when stories fail to load', async () => {
    vi.mocked(api.getEvent).mockResolvedValue(mockEvents[0]);
    vi.mocked(familyGraph.listContributions).mockRejectedValue(
      new ApiClientError('GENERIC', 'Route not found', 404)
    );

    renderPage();
    expect(await screen.findByRole('heading', { name: 'ทริปทะเลกับคุณยาย' })).toBeTruthy();
    expect(screen.getByText(copy['memory.stories.load_error'])).toBeTruthy();
    expect(screen.getByRole('button', { name: copy['memory.stories.retry'] })).toBeTruthy();
    expect(screen.getByRole('button', { name: copy['story.add.action'] })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: copy['story.add.action'] }));
    expect(screen.getByLabelText(copy['story.label.required'])).toBeTruthy();
    expect(screen.getByText(copy['contribution.photos.label'])).toBeTruthy();
    expect(
      screen.getByText(
        interpolate(copy['story.add.context'], { ชื่อความทรงจำ: mockEvents[0].title ?? '' })
      )
    ).toBeTruthy();
    expect(screen.queryByText(copy['error.INTERNAL_ERROR'])).toBeNull();
  });

  it('shows the generic unavailable state when the memory is 404', async () => {
    vi.mocked(api.getEvent).mockRejectedValue(new ApiClientError('NOT_FOUND', 'gone', 404));
    vi.mocked(familyGraph.listContributions).mockRejectedValue(
      new ApiClientError('NOT_FOUND', 'gone', 404)
    );

    renderPage();
    expect(await screen.findByText(copy['error.generic.body'])).toBeTruthy();
    expect(screen.getByRole('link', { name: copy['common.back_home'] }).getAttribute('href')).toBe(
      '/home'
    );
    expect(screen.getByRole('button', { name: copy['common.retry'] })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'ทริปทะเลกับคุณยาย' })).toBeNull();
    expect(screen.queryByText(copy['page.not_found.title'])).toBeNull();
  });

  it('disables add-story when the memory is paused', async () => {
    vi.mocked(api.getEvent).mockResolvedValue(mockEvents[1]);
    vi.mocked(familyGraph.listContributions).mockResolvedValue({ contributions: [] });

    renderPage(`/memories/${mockEvents[1].id}`);
    expect(await screen.findByText(copy['memory.paused.banner'])).toBeTruthy();
    expect(screen.getByText(copy['memory.paused.badge'])).toBeTruthy();
    expect((screen.getByRole('button', { name: copy['story.add.action'] }) as HTMLButtonElement).disabled).toBe(
      true
    );
    expect(screen.queryByLabelText(copy['story.label.required'])).toBeNull();
  });
});

describe('MemoryDetailPage contribution photos', () => {
  beforeEach(() => {
    createContribution.mockReset();
    latestOnStateChange = undefined;
    vi.mocked(toast.success).mockReset();
  });

  it('renders photos from the contribution list and survives a missing media field', async () => {
    vi.mocked(api.getEvent).mockResolvedValue(mockEvents[0]);
    vi.mocked(familyGraph.listContributions).mockResolvedValue({
      contributions: [
        mockContributions[0],
        {
          ...mockContributions[0],
          id: '99999999-9999-4999-8999-999999999999',
          story: 'ไม่มีรูป',
          media: undefined,
        },
      ],
    });

    renderPage();
    expect(await screen.findByText('จำได้ว่าทะเลเงียบ')).toBeTruthy();
    expect(
      screen.getByAltText(
        interpolate(copy['contribution.photo.alt'], {
          ชื่อผู้เล่า: mockContributions[0].owner_display_name ?? 'Atta',
          i: '1',
          n: '1',
        })
      )
    ).toBeTruthy();
    expect(screen.getByText('ไม่มีรูป')).toBeTruthy();
  });

  it('blocks save while uploads are busy, then sends media_ids', async () => {
    vi.mocked(api.getEvent).mockResolvedValue(mockEvents[0]);
    vi.mocked(familyGraph.listContributions).mockResolvedValue({ contributions: [] });
    createContribution.mockResolvedValue(mockContributions[0]);

    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: copy['story.add.action'] }));
    const story = await screen.findByLabelText(copy['story.label.required']);
    fireEvent.change(story, { target: { value: 'จำได้ว่าทะเลเงียบ' } });

    act(() => {
      latestOnStateChange?.({ mediaIds: [], isBusy: true });
    });
    expect(await screen.findByText(copy['photo.upload.wait'])).toBeTruthy();
    expect((screen.getByRole('button', { name: copy['story.save'] }) as HTMLButtonElement).disabled).toBe(true);

    const mediaId = '55555555-5555-4555-8555-555555555555';
    act(() => {
      latestOnStateChange?.({ mediaIds: [mediaId], isBusy: false });
    });
    await waitFor(() => {
      expect((screen.getByRole('button', { name: copy['story.save'] }) as HTMLButtonElement).disabled).toBe(false);
    });

    fireEvent.click(screen.getByRole('button', { name: copy['story.save'] }));
    await waitFor(() => {
      expect(createContribution).toHaveBeenCalledWith(mockEvents[0].id, {
        story: 'จำได้ว่าทะเลเงียบ',
        media_ids: [mediaId],
      });
    });
    expect(toast.success).toHaveBeenCalledWith(copy['save.toast']);
  });

  it('omits media_ids when no photos are attached', async () => {
    vi.mocked(api.getEvent).mockResolvedValue(mockEvents[0]);
    vi.mocked(familyGraph.listContributions).mockResolvedValue({ contributions: [] });
    createContribution.mockResolvedValue(mockContributions[0]);

    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: copy['story.add.action'] }));
    fireEvent.change(await screen.findByLabelText(copy['story.label.required']), {
      target: { value: 'ไม่มีรูปก็ได้' },
    });
    fireEvent.click(screen.getByRole('button', { name: copy['story.save'] }));
    await waitFor(() => {
      expect(createContribution).toHaveBeenCalledWith(mockEvents[0].id, {
        story: 'ไม่มีรูปก็ได้',
        media_ids: undefined,
      });
    });
  });

  it('confirms before discarding an unsaved story', async () => {
    vi.mocked(api.getEvent).mockResolvedValue(mockEvents[0]);
    vi.mocked(familyGraph.listContributions).mockResolvedValue({ contributions: [] });

    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: copy['story.add.action'] }));
    fireEvent.change(await screen.findByLabelText(copy['story.label.required']), {
      target: { value: 'ยังไม่บันทึก' },
    });
    fireEvent.click(screen.getByRole('link', { name: 'leave-memory' }));
    expect(await screen.findByText(copy['unsaved.title'])).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: copy['unsaved.stay'] }));
    expect(screen.getByLabelText(copy['story.label.required'])).toBeTruthy();
    expect(screen.queryByText('memories-list')).toBeNull();
    fireEvent.click(screen.getByRole('link', { name: 'leave-memory' }));
    fireEvent.click(await screen.findByRole('button', { name: copy['unsaved.leave'] }));
    expect(await screen.findByText('memories-list')).toBeTruthy();
  });
});
