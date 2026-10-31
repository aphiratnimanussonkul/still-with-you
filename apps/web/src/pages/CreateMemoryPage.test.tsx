import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Link, RouterProvider, createMemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PhotoAttachState } from '@/components/PhotoAttach';
import { copy, interpolate, optionalFieldLabel } from '@/copy';
import { ApiClientError } from '@/lib/api-errors';
import { mockAccount, mockEvents, mockFamilies, mockMembers, mockPeople } from '@/mocks/data';

const createEvent = vi.fn();
let latestOnStateChange: ((state: PhotoAttachState) => void) | undefined;

vi.mock('@/lib/api-client', () => ({
  api: {
    listFamilies: vi.fn(),
    createEvent: (...args: unknown[]) => createEvent(...args),
  },
}));

vi.mock('@/lib/family-graph', async () => {
  const actual = await vi.importActual<typeof import('@/lib/family-graph')>('@/lib/family-graph');
  return {
    ...actual,
    familyGraph: {
      ...actual.familyGraph,
      listPeople: vi.fn(),
      listMembers: vi.fn(),
    },
  };
});

vi.mock('@/hooks/use-me', () => ({
  useMe: () => ({
    data: { id: mockAccount.id, display_name: mockAccount.display_name },
  }),
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
import { familyGraph, personDisplayName } from '@/lib/family-graph';
import { MEMORY_CREATE_DRAFT_KEY, flushPwaDrafts, readDraft, writeDraft } from '@/lib/form-draft';
import { toast } from 'sonner';
import { CreateMemoryPage } from '@/pages/CreateMemoryPage';

const familyId = mockFamilies[0].id;

function renderPage(path = '/memories/new') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [
      {
        path: '/memories/new',
        element: (
          <>
            <Link to="/memories">leave-create</Link>
            <CreateMemoryPage />
          </>
        ),
      },
      { path: '/memories/:eventId', element: <p>memory-detail</p> },
      { path: '/memories', element: <p>memories-list</p> },
      { path: '/family/people/new', element: <p>add-person</p> },
      { path: '/family', element: <p>family-page</p> },
    ],
    { initialEntries: [path] }
  );
  return {
    router,
    ...render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    ),
  };
}

beforeEach(() => {
  sessionStorage.clear();
  createEvent.mockReset();
  latestOnStateChange = undefined;
  vi.mocked(api.listFamilies).mockResolvedValue({ families: mockFamilies });
  vi.mocked(familyGraph.listPeople).mockResolvedValue({ people: mockPeople, relationships: [] });
  vi.mocked(familyGraph.listMembers).mockResolvedValue({ members: mockMembers });
});

describe('CreateMemoryPage', () => {
  it('renders the create fields without bottom-nav content', async () => {
    renderPage();
    expect(await screen.findByLabelText(copy['memory.title_label'])).toBeTruthy();
    expect(screen.getByLabelText(copy['memory.date.year'])).toBeTruthy();
    expect(screen.getByLabelText(copy['memory.date.month'])).toBeTruthy();
    expect(screen.getByLabelText(copy['memory.date.day'])).toBeTruthy();
    expect(screen.getByText(copy['memory.date_placeholder'])).toBeTruthy();
    expect(screen.getByText(optionalFieldLabel(copy['memory.date_label']))).toBeTruthy();
    expect(screen.getByText(optionalFieldLabel(copy['memory.people_label']))).toBeTruthy();
    expect(screen.getByRole('button', { name: copy['home.focus.invite.action'] })).toBeTruthy();
    expect(screen.getByLabelText(copy['story.label.required'])).toBeTruthy();
    expect(screen.getByText(interpolate(copy['person.bio.counter'], { count: '0' }))).toBeTruthy();
    expect(screen.getByTestId('photo-attach').textContent).toBe(copy['contribution.photos.label']);
    expect(screen.getByRole('button', { name: copy['memory.create.submit'] })).toBeTruthy();
  });

  it('shows required copy and does not save when title and story are empty', async () => {
    renderPage();
    expect(await screen.findByLabelText(copy['memory.title_label'])).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: copy['memory.create.submit'] }));
    expect(await screen.findByText(copy['memory.title_required'])).toBeTruthy();
    expect(screen.getByText(copy['error.STORY_REQUIRED'])).toBeTruthy();
    expect(createEvent).not.toHaveBeenCalled();
  });

  it('saves title, story, year-only date, people, and photos then opens detail', async () => {
    createEvent.mockResolvedValue(mockEvents[0]);
    renderPage();
    expect(await screen.findByLabelText(copy['memory.title_label'])).toBeTruthy();
    expect(await screen.findByRole('button', { name: copy['home.focus.invite.action'] })).toBeTruthy();

    fireEvent.change(screen.getByLabelText(copy['memory.title_label']), {
      target: { value: 'งานบวชน้าชัย' },
    });
    fireEvent.change(screen.getByLabelText(copy['memory.date.year']), {
      target: { value: '2540' },
    });
    fireEvent.change(screen.getByLabelText(copy['story.label.required']), {
      target: { value: 'วันนั้นทั้งบ้านตื่นตั้งแต่ตีห้า' },
    });

    fireEvent.click(screen.getByRole('button', { name: copy['home.focus.invite.action'] }));
    fireEvent.click(await screen.findByRole('checkbox', { name: personDisplayName(mockPeople[0]) }));
    fireEvent.click(screen.getByRole('button', { name: copy['memory.people.done'] }));
    expect(await screen.findByText(personDisplayName(mockPeople[0]))).toBeTruthy();
    expect(screen.getByRole('button', { name: copy['memory.people.edit'] })).toBeTruthy();

    const mediaId = '55555555-5555-4555-8555-555555555555';
    act(() => {
      latestOnStateChange?.({ mediaIds: [mediaId], isBusy: false });
    });

    fireEvent.click(screen.getByRole('button', { name: copy['memory.create.submit'] }));
    await waitFor(() => {
      expect(createEvent).toHaveBeenCalledWith(familyId, {
        title: 'งานบวชน้าชัย',
        story: 'วันนั้นทั้งบ้านตื่นตั้งแต่ตีห้า',
        person_ids: [mockPeople[0].id],
        media_ids: [mediaId],
        occurred_from: '1997-01-01',
        date_precision: 'year',
      });
    });
    expect(toast.success).toHaveBeenCalledWith(copy['save.toast']);
    expect(await screen.findByText('memory-detail')).toBeTruthy();
  });

  it('sends month and day precision when those parts are set', async () => {
    createEvent.mockResolvedValue(mockEvents[0]);
    renderPage();
    fireEvent.change(await screen.findByLabelText(copy['memory.title_label']), {
      target: { value: 'ทริปหัวหิน' },
    });
    fireEvent.change(screen.getByLabelText(copy['memory.date.year']), { target: { value: '2539' } });
    fireEvent.change(screen.getByLabelText(copy['memory.date.month']), { target: { value: '4' } });
    fireEvent.change(screen.getByLabelText(copy['memory.date.day']), { target: { value: '12' } });
    fireEvent.change(screen.getByLabelText(copy['story.label.required']), {
      target: { value: 'จำได้ว่าทะเลเงียบ' },
    });
    fireEvent.click(screen.getByRole('button', { name: copy['memory.create.submit'] }));
    await waitFor(() => {
      expect(createEvent).toHaveBeenCalledWith(familyId, {
        title: 'ทริปหัวหิน',
        story: 'จำได้ว่าทะเลเงียบ',
        person_ids: [],
        media_ids: [],
        occurred_from: '1996-04-12',
        date_precision: 'day',
      });
    });
  });

  it('blocks save while photos are uploading', async () => {
    renderPage();
    fireEvent.change(await screen.findByLabelText(copy['memory.title_label']), {
      target: { value: 'ทริปหัวหิน' },
    });
    fireEvent.change(screen.getByLabelText(copy['story.label.required']), {
      target: { value: 'จำได้ว่าทะเลเงียบ' },
    });
    act(() => {
      latestOnStateChange?.({ mediaIds: [], isBusy: true });
    });
    expect(await screen.findByText(copy['photo.upload.wait'])).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: copy['memory.create.submit'] }) as HTMLButtonElement).disabled
    ).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: copy['memory.create.submit'] }));
    expect(createEvent).not.toHaveBeenCalled();
  });

  it('shows person_ids.invalid when create rejects the selected people', async () => {
    createEvent.mockRejectedValue(
      new ApiClientError('INVALID_INPUT', 'Invalid person_ids', 400, 'person_ids')
    );
    renderPage();
    fireEvent.change(await screen.findByLabelText(copy['memory.title_label']), {
      target: { value: 'งานบวชน้าชัย' },
    });
    fireEvent.change(screen.getByLabelText(copy['story.label.required']), {
      target: { value: 'วันนั้นทั้งบ้านตื่นตั้งแต่ตีห้า' },
    });
    fireEvent.click(screen.getByRole('button', { name: copy['home.focus.invite.action'] }));
    fireEvent.click(await screen.findByRole('checkbox', { name: personDisplayName(mockPeople[0]) }));
    fireEvent.click(screen.getByRole('button', { name: copy['memory.people.done'] }));
    fireEvent.click(screen.getByRole('button', { name: copy['memory.create.submit'] }));
    expect(await screen.findByText(copy['person_ids.invalid'])).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows a save-failed alert from existing error copy', async () => {
    createEvent.mockRejectedValue(new ApiClientError('GENERIC', 'Route not found', 404));
    renderPage();
    fireEvent.change(await screen.findByLabelText(copy['memory.title_label']), {
      target: { value: 'งานบวชน้าชัย' },
    });
    fireEvent.change(screen.getByLabelText(copy['story.label.required']), {
      target: { value: 'วันนั้นทั้งบ้านตื่นตั้งแต่ตีห้า' },
    });
    fireEvent.click(screen.getByRole('button', { name: copy['memory.create.submit'] }));
    expect(await screen.findByText(copy['error.generic'])).toBeTruthy();
    expect(screen.getByLabelText(copy['memory.title_label'])).toBeTruthy();
  });

  it('shows people-search empty copy and an add-person link', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: copy['home.focus.invite.action'] }));
    fireEvent.change(await screen.findByLabelText(copy['memory.search.placeholder']), {
      target: { value: 'ป้าแดง' },
    });
    expect(await screen.findByText(copy['memory.people.search.empty'])).toBeTruthy();
    expect(
      screen
        .getByRole('link', { name: interpolate(copy['memory.people.search.add'], { name: 'ป้าแดง' }) })
        .getAttribute('href')
    ).toBe('/family/people/new');
  });

  it('hides the people-search add-person link when the viewer is not an admin', async () => {
    vi.mocked(familyGraph.listMembers).mockResolvedValue({
      members: mockMembers.map((member) => ({ ...member, role: 'member' as const })),
    });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: copy['home.focus.invite.action'] }));
    fireEvent.change(await screen.findByLabelText(copy['memory.search.placeholder']), {
      target: { value: 'ป้าแดง' },
    });
    expect(await screen.findByText(copy['memory.people.search.empty'])).toBeTruthy();
    expect(
      screen.queryByRole('link', { name: interpolate(copy['memory.people.search.add'], { name: 'ป้าแดง' }) })
    ).toBeNull();
  });

  it('uses add_empty when the people search query is blank', async () => {
    vi.mocked(familyGraph.listPeople).mockResolvedValue({ people: [], relationships: [] });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: copy['home.focus.invite.action'] }));
    expect(await screen.findByText(copy['memory.people.search.empty'])).toBeTruthy();
    expect(screen.getByRole('link', { name: copy['memory.people.search.add_empty'] }).getAttribute('href')).toBe(
      '/family/people/new'
    );
    expect(screen.queryByText(/เป็นคนใหม่/)).toBeNull();
  });

  it('confirms before discarding an unsaved create', async () => {
    renderPage();
    fireEvent.change(await screen.findByLabelText(copy['memory.title_label']), {
      target: { value: 'งานบวชน้าชัย' },
    });
    fireEvent.click(screen.getByRole('link', { name: 'leave-create' }));
    expect(await screen.findByText(copy['unsaved.title'])).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: copy['unsaved.stay'] }));
    expect(screen.getByLabelText(copy['memory.title_label'])).toBeTruthy();
    fireEvent.click(screen.getByRole('link', { name: 'leave-create' }));
    fireEvent.click(await screen.findByRole('button', { name: copy['unsaved.leave'] }));
    expect(await screen.findByText('memories-list')).toBeTruthy();
  });

  it('restores create title and story from sessionStorage after reload', async () => {
    writeDraft(MEMORY_CREATE_DRAFT_KEY, { title: 'งานบวช', story: 'วันนั้นทั้งบ้านตื่น' });
    renderPage();
    expect(await screen.findByLabelText(copy['memory.title_label'])).toBeTruthy();
    expect((screen.getByLabelText(copy['memory.title_label']) as HTMLInputElement).value).toBe('งานบวช');
    expect((screen.getByLabelText(copy['story.label.required']) as HTMLTextAreaElement).value).toBe(
      'วันนั้นทั้งบ้านตื่น'
    );
  });

  it('writes the create draft on flush so a PWA reload keeps it', async () => {
    renderPage();
    fireEvent.change(await screen.findByLabelText(copy['memory.title_label']), {
      target: { value: 'ยังไม่บันทึก' },
    });
    fireEvent.change(screen.getByLabelText(copy['story.label.required']), {
      target: { value: 'พิมพ์ค้างไว้' },
    });
    flushPwaDrafts();
    expect(readDraft(MEMORY_CREATE_DRAFT_KEY)).toEqual({ title: 'ยังไม่บันทึก', story: 'พิมพ์ค้างไว้' });
  });
});

