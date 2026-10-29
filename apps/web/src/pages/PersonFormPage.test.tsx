import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Link, RouterProvider, createMemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { copy, interpolateHeading } from '@/copy';
import { ApiClientError } from '@/lib/api-errors';
import { mockAccount, mockFamilies, mockMembers, mockPeople } from '@/mocks/data';

vi.mock('@/lib/api-client', () => ({
  api: {
    listFamilies: vi.fn(),
  },
}));

vi.mock('@/lib/family-graph', async () => {
  const actual = await vi.importActual<typeof import('@/lib/family-graph')>('@/lib/family-graph');
  return {
    ...actual,
    familyGraph: {
      getPerson: vi.fn(),
      listMembers: vi.fn(),
      updatePerson: vi.fn(),
      deletePerson: vi.fn(),
    },
  };
});

vi.mock('@/hooks/use-me', () => ({
  useMe: () => ({ data: mockAccount }),
}));

vi.mock('@/components/PersonPhotoField', () => ({
  PersonPhotoField: ({
    onReady,
    onRemove,
    fieldError,
  }: {
    onReady: (id: string | null, busy: boolean) => void;
    onRemove?: () => void;
    fieldError?: string | null;
  }) => (
    <div>
      <button type="button" onClick={() => onReady('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', false)}>
        add-photo
      </button>
      <button type="button" onClick={() => onRemove?.()}>
        remove-photo
      </button>
      {fieldError ? <p>{fieldError}</p> : null}
    </div>
  ),
}));

import { api } from '@/lib/api-client';
import { familyGraph } from '@/lib/family-graph';
import { PersonFormPage } from '@/pages/PersonFormPage';

const grandma = mockPeople[0];

function renderEdit(id = grandma.id) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [
      {
        path: '/family/people/:personId/edit',
        element: (
          <>
            <Link to="/family">leave-form</Link>
            <PersonFormPage />
          </>
        ),
      },
      { path: '/family/people/:personId', element: <p>person-page</p> },
      { path: '/family', element: <p>family-page</p> },
    ],
    { initialEntries: [`/family/people/${id}/edit`] }
  );
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}

describe('PersonFormPage edit', () => {
  beforeEach(() => {
    vi.mocked(familyGraph.getPerson).mockReset();
    vi.mocked(familyGraph.listMembers).mockReset();
    vi.mocked(familyGraph.updatePerson).mockReset();
    vi.mocked(api.listFamilies).mockResolvedValue({ families: mockFamilies });
    vi.mocked(familyGraph.getPerson).mockResolvedValue(grandma);
    vi.mocked(familyGraph.listMembers).mockResolvedValue({ members: mockMembers });
    vi.mocked(familyGraph.updatePerson).mockResolvedValue(grandma);
  });

  it('keeps save disabled until something is edited and PATCHes only that field', async () => {
    renderEdit();
    const save = await screen.findByRole('button', { name: copy['person.save'] });
    expect((save as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(copy['person.edit.relation_note'])).toBeTruthy();

    fireEvent.change(screen.getByLabelText(copy['person.name.label']), {
      target: { value: 'สมศรี นิมานัส' },
    });
    expect((save as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(save);

    await waitFor(() =>
      expect(familyGraph.updatePerson).toHaveBeenCalledWith(grandma.id, {
        display_name: 'สมศรี นิมานัส',
      })
    );
    const payload = vi.mocked(familyGraph.updatePerson).mock.calls[0]?.[1];
    expect(payload).not.toHaveProperty('version');
    expect(await screen.findByText('person-page')).toBeTruthy();
  });

  it('sends avatar_media_id null when the photo is removed', async () => {
    renderEdit();
    fireEvent.click(await screen.findByRole('button', { name: 'remove-photo' }));
    fireEvent.click(screen.getByRole('button', { name: copy['person.save'] }));
    await waitFor(() =>
      expect(familyGraph.updatePerson).toHaveBeenCalledWith(grandma.id, { avatar_media_id: null })
    );
  });

  it('shows name required under the name field', async () => {
    renderEdit();
    fireEvent.change(await screen.findByLabelText(copy['person.name.label']), {
      target: { value: '  ' },
    });
    fireEvent.change(screen.getByLabelText(copy['person.nickname.label']), {
      target: { value: 'ยาย' },
    });
    fireEvent.click(screen.getByRole('button', { name: copy['person.save'] }));
    expect(await screen.findByText(copy['person.name.required'])).toBeTruthy();
    expect(familyGraph.updatePerson).not.toHaveBeenCalled();
  });

  it('shows MEDIA_NOT_READY under the photo field', async () => {
    vi.mocked(familyGraph.updatePerson).mockRejectedValue(
      new ApiClientError('MEDIA_NOT_READY', 'not ready', 409, 'avatar_media_id')
    );
    renderEdit();
    fireEvent.click(await screen.findByRole('button', { name: 'add-photo' }));
    fireEvent.click(screen.getByRole('button', { name: copy['person.save'] }));
    expect(await screen.findByText(copy['person.edit.media_not_ready'])).toBeTruthy();
    expect(screen.queryByText(copy['person.edit.save_failed'])).toBeNull();
  });

  it('shows person.edit.forbidden on 403 and returns to the profile on dismiss', async () => {
    vi.mocked(familyGraph.updatePerson).mockRejectedValue(new ApiClientError('FORBIDDEN', 'no', 403));
    renderEdit();
    fireEvent.change(await screen.findByLabelText(copy['person.name.label']), {
      target: { value: 'สมศรี นิมานัส' },
    });
    fireEvent.click(screen.getByRole('button', { name: copy['person.save'] }));
    expect(await screen.findByText(copy['person.edit.forbidden'])).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: copy['a11y.back'] }));
    expect(await screen.findByText('person-page')).toBeTruthy();
  });

  it('shows save_failed plus retry on 5xx', async () => {
    vi.mocked(familyGraph.updatePerson).mockRejectedValue(new ApiClientError('INTERNAL_ERROR', 'boom', 500));
    renderEdit();
    fireEvent.change(await screen.findByLabelText(copy['person.name.label']), {
      target: { value: 'สมศรี นิมานัส' },
    });
    fireEvent.click(screen.getByRole('button', { name: copy['person.save'] }));
    expect(await screen.findByText(copy['person.edit.save_failed'])).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: copy['common.retry'] }));
    await waitFor(() => expect(familyGraph.updatePerson).toHaveBeenCalledTimes(2));
  });

  it('hides the form when the viewer is not an admin and returns to the profile', async () => {
    vi.mocked(familyGraph.listMembers).mockResolvedValue({
      members: mockMembers.map((member) => ({ ...member, role: 'member' as const })),
    });
    renderEdit();
    expect(await screen.findByText(copy['person.edit.forbidden'])).toBeTruthy();
    expect(screen.queryByLabelText(copy['person.name.label'])).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: copy['a11y.back'] }));
    expect(await screen.findByText('person-page')).toBeTruthy();
  });

  it('confirms discard with person.add.discard keys', async () => {
    renderEdit();
    fireEvent.change(await screen.findByLabelText(copy['person.name.label']), {
      target: { value: 'สมศรี นิมานัส' },
    });
    fireEvent.click(screen.getByRole('link', { name: 'leave-form' }));
    expect(await screen.findByText(copy['person.add.discard.title'])).toBeTruthy();
    expect(screen.queryByText(copy['person.unsaved.title'])).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: copy['person.add.discard.keep'] }));
    expect(screen.queryByText('family-page')).toBeNull();
    fireEvent.click(screen.getByRole('link', { name: 'leave-form' }));
    fireEvent.click(await screen.findByRole('button', { name: copy['person.add.discard.leave'] }));
    expect(await screen.findByText('family-page')).toBeTruthy();
  });

  it('interpolates the edit title without spaces around the name', () => {
    expect(interpolateHeading(copy['person.edit.title'], { name: 'ยายสมศรี' })).toBe(
      'แก้ข้อมูลของยายสมศรี'
    );
  });
});
