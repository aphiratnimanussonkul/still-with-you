import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorCode } from '@still-with-you/contracts';
import { copy } from '@/copy';
import { ApiClientError } from '@/lib/api-errors';
import { mockEvents } from '@/mocks/data';

vi.mock('@/lib/api-client', () => ({
  api: {
    getEvent: vi.fn(),
    updateEvent: vi.fn(),
  },
}));

vi.mock('sonner', () => {
  const toast = Object.assign(vi.fn(), { success: vi.fn() });
  return { toast };
});

import { api } from '@/lib/api-client';
import { EditMemoryPage } from '@/pages/EditMemoryPage';

const loaded = mockEvents[0];

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [
      { path: '/memories/:eventId/edit', element: <EditMemoryPage /> },
      { path: '/memories/:eventId', element: <p>memory-detail</p> },
      { path: '/home', element: <p>home-page</p> },
    ],
    { initialEntries: [`/memories/${loaded.id}/edit`] }
  );
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    ),
  };
}

describe('EditMemoryPage conflict', () => {
  beforeEach(() => {
    vi.mocked(api.getEvent).mockReset();
    vi.mocked(api.updateEvent).mockReset();
    vi.mocked(api.getEvent).mockResolvedValue(loaded);
  });

  it('keeps in-progress title on 409 and only fetches latest after tapping เปิดฉบับล่าสุด', async () => {
    vi.mocked(api.updateEvent).mockRejectedValueOnce(
      new ApiClientError(ErrorCode.EVENT_EDIT_CONFLICT, 'stale', 409, undefined, { current_version: 2 })
    );
    vi.mocked(api.getEvent)
      .mockResolvedValueOnce(loaded)
      .mockResolvedValueOnce({
        ...loaded,
        title: 'แก้จากที่อื่น',
        occurred_from: '2019-01-01',
        version: 2,
      });

    renderPage();
    const title = await screen.findByLabelText(copy['memory.title_label']);
    fireEvent.change(title, { target: { value: 'ฉันพิมพ์ไว้แล้ว' } });
    fireEvent.click(screen.getByRole('button', { name: copy['story.save'] }));

    expect((await screen.findByRole('alert')).textContent).toBe(copy['memory.edit.conflict.body']);
    expect((title as HTMLInputElement).value).toBe('ฉันพิมพ์ไว้แล้ว');
    expect(screen.queryByText(/มีคนแก้ชื่อความทรงจำ/)).toBeNull();
    expect(api.getEvent).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: copy['memory.edit.conflict.action'] }));
    expect(
      await screen.findByText('มีคนแก้ชื่อความทรงจำและวันที่ไปแล้ว ที่คุณแก้ไว้ด้านล่างยังอยู่ครบ')
    ).toBeTruthy();
    expect((title as HTMLInputElement).value).toBe('ฉันพิมพ์ไว้แล้ว');
    expect(api.getEvent).toHaveBeenCalledTimes(2);

    vi.mocked(api.updateEvent).mockResolvedValueOnce({
      ...loaded,
      title: 'ฉันพิมพ์ไว้แล้ว',
      version: 3,
    });
    fireEvent.click(screen.getByRole('button', { name: copy['story.save'] }));
    await waitFor(() => {
      expect(api.updateEvent).toHaveBeenLastCalledWith(loaded.id, {
        title: 'ฉันพิมพ์ไว้แล้ว',
        version: 2,
      });
    });
  });

  it('does not hydrate a later query refetch into the in-progress title', async () => {
    const { client } = renderPage();
    const title = await screen.findByLabelText(copy['memory.title_label']);
    fireEvent.change(title, { target: { value: 'ฉันพิมพ์ไว้แล้ว' } });

    vi.mocked(api.getEvent).mockResolvedValue({
      ...loaded,
      title: 'แก้จากที่อื่น',
      version: 2,
    });
    await client.invalidateQueries();
    await waitFor(() => {
      expect(vi.mocked(api.getEvent).mock.calls.length).toBeGreaterThan(1);
    });
    expect((title as HTMLInputElement).value).toBe('ฉันพิมพ์ไว้แล้ว');
  });

  it('keeps the draft and shows load_failed plus retry when opening latest fails', async () => {
    vi.mocked(api.updateEvent).mockRejectedValueOnce(
      new ApiClientError(ErrorCode.EVENT_EDIT_CONFLICT, 'stale', 409, undefined, { current_version: 2 })
    );
    vi.mocked(api.getEvent)
      .mockResolvedValueOnce(loaded)
      .mockRejectedValueOnce(new ApiClientError('INTERNAL_ERROR', 'boom', 500))
      .mockResolvedValueOnce({
        ...loaded,
        title: 'แก้จากที่อื่น',
        occurred_from: '2019-01-01',
        version: 2,
      });

    renderPage();
    const title = await screen.findByLabelText(copy['memory.title_label']);
    fireEvent.change(title, { target: { value: 'ฉันพิมพ์ไว้แล้ว' } });
    fireEvent.click(screen.getByRole('button', { name: copy['story.save'] }));
    expect((await screen.findByRole('alert')).textContent).toBe(copy['memory.edit.conflict.body']);

    fireEvent.click(screen.getByRole('button', { name: copy['memory.edit.conflict.action'] }));
    expect(await screen.findByText(copy['memory.edit.conflict.load_failed'])).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toBe(copy['memory.edit.conflict.load_failed']);
    expect((title as HTMLInputElement).value).toBe('ฉันพิมพ์ไว้แล้ว');
    expect(screen.queryByText(copy['error.generic.body'])).toBeNull();
    expect(screen.getByRole('button', { name: copy['common.retry'] })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: copy['common.retry'] }));
    expect(
      await screen.findByText('มีคนแก้ชื่อความทรงจำและวันที่ไปแล้ว ที่คุณแก้ไว้ด้านล่างยังอยู่ครบ')
    ).toBeTruthy();
    expect((title as HTMLInputElement).value).toBe('ฉันพิมพ์ไว้แล้ว');
    expect(screen.queryByText(copy['memory.edit.conflict.load_failed'])).toBeNull();
  });
});

describe('EditMemoryPage unavailable', () => {
  beforeEach(() => {
    vi.mocked(api.getEvent).mockReset();
    vi.mocked(api.updateEvent).mockReset();
  });

  it('shows MemoryUnavailableState title and home link on 404', async () => {
    vi.mocked(api.getEvent).mockRejectedValue(new ApiClientError('NOT_FOUND', 'gone', 404));
    renderPage();
    expect(
      await screen.findByRole('heading', { name: copy['memory.unavailable.title'] })
    ).toBeTruthy();
    expect(screen.getByText(copy['memory.unavailable.body'])).toBeTruthy();
    expect(
      screen.getByRole('link', { name: copy['memory.unavailable.home'] }).getAttribute('href')
    ).toBe('/home');
    expect(screen.queryByRole('button', { name: copy['common.retry'] })).toBeNull();
    expect(screen.queryByLabelText(copy['memory.title_label'])).toBeNull();
    fireEvent.click(screen.getByRole('link', { name: copy['memory.unavailable.home'] }));
    expect(await screen.findByText('home-page')).toBeTruthy();
  });
});
