import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { copy } from '@/copy';
import { formatThaiDateTime } from '@/lib/dates';
import { mockFamilies, mockNotifications } from '@/mocks/data';
import { notificationBody } from '@/lib/notifications-api';

vi.mock('@/lib/notifications-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/notifications-api')>();
  return {
    ...actual,
    notificationsApi: {
      list: vi.fn(),
      markRead: vi.fn(),
    },
  };
});

vi.mock('@/hooks/use-me', () => ({
  useMe: () => ({
    isPending: false,
    isError: false,
    data: {
      display_name: 'Atta',
      email: 'atta@example.com',
      marketing_consent: false,
      marketing_consent_at: '2026-01-01T00:00:00.000Z',
      consent_answered_at: '2026-01-01T00:00:00.000Z',
    },
  }),
}));

import { notificationsApi } from '@/lib/notifications-api';
import { MePage } from '@/pages/MePage';

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/me']}>
        <Routes>
          <Route path="/me" element={<MePage />} />
          <Route path="/memories/:eventId" element={<div>memory-detail</div>} />
          <Route path="/family" element={<div>family-page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('MePage notifications', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.mocked(notificationsApi.list).mockReset();
    vi.mocked(notificationsApi.markRead).mockReset();
  });

  it('renders Eddy bodies for contribution_added and invite_accepted', async () => {
    vi.mocked(notificationsApi.list).mockResolvedValue({
      notifications: mockNotifications,
      next_cursor: null,
      unread_count: 2,
    });

    renderPage();
    expect(await screen.findByText(notificationBody(mockNotifications[0]))).toBeTruthy();
    expect(screen.getByText(notificationBody(mockNotifications[1]))).toBeTruthy();
    expect(screen.getByText(formatThaiDateTime(mockNotifications[0].created_at))).toBeTruthy();
    expect(screen.getByText(copy['settings.account.title'])).toBeTruthy();
    expect(screen.getByRole('link', { name: copy['nav.trash'] })).toBeTruthy();
  });

  it('renders a contribution notification when event_title is null', async () => {
    const hidden = {
      ...mockNotifications[0],
      payload: {
        ...mockNotifications[0].payload,
        event_title: null,
      },
    };
    vi.mocked(notificationsApi.list).mockResolvedValue({
      notifications: [hidden],
      next_cursor: null,
      unread_count: 1,
    });

    renderPage();
    expect(await screen.findByText(notificationBody(hidden))).toBeTruthy();
    expect(screen.getByText(copy['settings.account.title'])).toBeTruthy();
  });

  it('shows the empty placeholder when the list is empty', async () => {
    vi.mocked(notificationsApi.list).mockResolvedValue({
      notifications: [],
      next_cursor: null,
      unread_count: 0,
    });

    renderPage();
    expect(await screen.findByText(copy['notification.empty.title'])).toBeTruthy();
    expect(screen.getByText(copy['notification.empty.body'])).toBeTruthy();
    expect(screen.getByText(copy['settings.account.title'])).toBeTruthy();
  });

  it('keeps settings when the notifications list fails', async () => {
    vi.mocked(notificationsApi.list).mockRejectedValue(new Error('boom'));

    renderPage();
    expect(await screen.findByText(copy['error.generic'])).toBeTruthy();
    expect(screen.getByRole('button', { name: copy['family.focus.load_error.action'] })).toBeTruthy();
    expect(screen.getByText(copy['settings.account.title'])).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: copy['family.focus.load_error.action'] }));
    await waitFor(() => expect(vi.mocked(notificationsApi.list).mock.calls.length).toBeGreaterThan(1));
  });

  it('marks a contribution notification read and opens the memory', async () => {
    vi.mocked(notificationsApi.list).mockResolvedValue({
      notifications: [mockNotifications[0]],
      next_cursor: null,
      unread_count: 1,
    });
    vi.mocked(notificationsApi.markRead).mockResolvedValue({
      ...mockNotifications[0],
      read_at: '2026-10-22T08:01:00.000Z',
    });

    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: new RegExp(notificationBody(mockNotifications[0])) }));
    await waitFor(() => expect(notificationsApi.markRead).toHaveBeenCalledWith(mockNotifications[0].id));
    expect(await screen.findByText('memory-detail')).toBeTruthy();
    expect(sessionStorage.getItem('swy.lastFamilyId')).toBe(mockFamilies[0].id);
  });

  it('opens family after an invite_accepted tap', async () => {
    vi.mocked(notificationsApi.list).mockResolvedValue({
      notifications: [mockNotifications[1]],
      next_cursor: null,
      unread_count: 1,
    });
    vi.mocked(notificationsApi.markRead).mockResolvedValue({
      ...mockNotifications[1],
      read_at: '2026-10-21T08:01:00.000Z',
    });

    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: new RegExp(notificationBody(mockNotifications[1])) }));
    await waitFor(() => expect(notificationsApi.markRead).toHaveBeenCalledWith(mockNotifications[1].id));
    expect(await screen.findByText('family-page')).toBeTruthy();
  });

  it('loads the next page when next_cursor is set', async () => {
    vi.mocked(notificationsApi.list)
      .mockResolvedValueOnce({
        notifications: [mockNotifications[0]],
        next_cursor: mockNotifications[0].id,
        unread_count: 2,
      })
      .mockResolvedValueOnce({
        notifications: [mockNotifications[1]],
        next_cursor: null,
        unread_count: 2,
      });

    renderPage();
    expect(await screen.findByText(notificationBody(mockNotifications[0]))).toBeTruthy();
    expect(screen.queryByText(notificationBody(mockNotifications[1]))).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: copy['notification.load_more'] }));
    expect(await screen.findByText(notificationBody(mockNotifications[1]))).toBeTruthy();
    expect(notificationsApi.list).toHaveBeenLastCalledWith(mockNotifications[0].id);
  });
});
