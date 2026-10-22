import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Link, RouterProvider, createMemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { copy, interpolate } from '@/copy';
import { ApiClientError } from '@/lib/api-errors';
import { mockFamilies, mockMembers, mockPeople } from '@/mocks/data';

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
      listPeople: vi.fn(),
      listMembers: vi.fn(),
      createPerson: vi.fn(),
      updatePerson: vi.fn(),
      createRelationship: vi.fn(),
      deleteRelationship: vi.fn(),
    },
  };
});

vi.mock('@/hooks/use-me', () => ({
  useMe: () => ({
    data: { id: '11111111-1111-4111-8111-111111111111', display_name: 'Atta' },
  }),
}));

vi.mock('@/components/PhotoAttach', () => ({
  PhotoAttach: ({ label }: { label?: string }) => <div data-testid="photo-attach">{label}</div>,
}));

import { api } from '@/lib/api-client';
import { familyGraph } from '@/lib/family-graph';
import { PersonFormPage } from '@/pages/PersonFormPage';

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [
      {
        path: '/family/people/new',
        element: (
          <>
            <Link to="/family">leave-form</Link>
            <PersonFormPage />
          </>
        ),
      },
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
    { initialEntries: [path] }
  );
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}

const created = {
  ...mockPeople[0],
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  display_name: 'น้องใหม่',
  relation_label: null,
  birth_date: '2018-04-12',
  birth_date_precision: 'day' as const,
};

describe('PersonFormPage', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.mocked(familyGraph.listPeople).mockReset();
    vi.mocked(familyGraph.listMembers).mockReset();
    vi.mocked(familyGraph.createPerson).mockReset();
    vi.mocked(familyGraph.updatePerson).mockReset();
    vi.mocked(familyGraph.createRelationship).mockReset();
    vi.mocked(familyGraph.deleteRelationship).mockReset();
    vi.mocked(api.listFamilies).mockResolvedValue({ families: mockFamilies });
    vi.mocked(familyGraph.listPeople).mockResolvedValue({ people: mockPeople, relationships: [] });
    vi.mocked(familyGraph.listMembers).mockResolvedValue({ members: mockMembers });
    vi.mocked(familyGraph.createPerson).mockResolvedValue(created);
    vi.mocked(familyGraph.createRelationship).mockResolvedValue({
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      family_id: mockFamilies[0].id,
      person_id: created.id,
      related_person_id: mockPeople[0].id,
      type: 'parent',
      created_by_account_id: mockPeople[0].created_by_account_id,
      created_at: '2026-10-22T00:00:00.000Z',
    });
  });

  it('shows Eddy labels, gender radios, year-only switch, and a bio counter', async () => {
    renderAt('/family/people/new');
    expect(await screen.findByLabelText(copy['person.display_name.label'])).toBeTruthy();
    expect(screen.getByLabelText(copy['person.family_name.label'])).toBeTruthy();
    expect(screen.getByText(copy['person.gender.label'])).toBeTruthy();
    expect(screen.getByText(copy['person.birth.hint'])).toBeTruthy();
    expect(screen.getByTestId('photo-attach').textContent).toBe(copy['person.avatar.label']);
    expect(screen.getByLabelText(copy['person.gender.female'])).toBeTruthy();
    expect(screen.getByLabelText(copy['person.gender.male'])).toBeTruthy();
    expect(screen.getByLabelText(copy['person.gender.other'])).toBeTruthy();
    expect(screen.getByLabelText(copy['person.gender.unspecified'])).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'ล้างที่เลือก' })).toBeNull();
    expect(screen.getByLabelText(copy['person.birth.label'])).toHaveAttribute('type', 'date');
    expect(screen.getByRole('switch', { name: copy['person.birth.mode.year'] })).toBeTruthy();
    expect(screen.getByText(interpolate(copy['person.bio.counter'], { count: '0' }))).toBeTruthy();
    expect(screen.getByPlaceholderText(copy['person.relation_label.placeholder'])).toBeTruthy();
  });

  it('maps gender radios and person-then-type parent relationship', async () => {
    renderAt('/family/people/new');
    fireEvent.change(await screen.findByLabelText(copy['person.display_name.label']), {
      target: { value: 'น้องใหม่' },
    });
    fireEvent.click(screen.getByLabelText(copy['person.gender.male']));
    fireEvent.change(screen.getByLabelText(copy['person.birth.label']), {
      target: { value: '2018-04-12' },
    });
    fireEvent.change(screen.getByLabelText(copy['person.relationship.label']), {
      target: { value: mockPeople[0].id },
    });
    fireEvent.click(screen.getByLabelText(copy['person.relationship.parent']));
    fireEvent.click(screen.getByRole('button', { name: copy['person.save'] }));

    await waitFor(() =>
      expect(familyGraph.createPerson).toHaveBeenCalledWith(mockFamilies[0].id, {
        display_name: 'น้องใหม่',
        gender: 'male',
        birth_date: '2018-04-12',
        birth_date_precision: 'day',
      })
    );
    await waitFor(() =>
      expect(familyGraph.createRelationship).toHaveBeenCalledWith(mockFamilies[0].id, {
        person_id: created.id,
        related_person_id: mockPeople[0].id,
        type: 'parent',
      })
    );
    expect(await screen.findByText('person-page')).toBeTruthy();
  });

  it('saves gender other', async () => {
    renderAt('/family/people/new');
    fireEvent.change(await screen.findByLabelText(copy['person.display_name.label']), {
      target: { value: 'น้องใหม่' },
    });
    fireEvent.click(screen.getByLabelText(copy['person.gender.other']));
    fireEvent.click(screen.getByRole('button', { name: copy['person.save'] }));

    await waitFor(() =>
      expect(familyGraph.createPerson).toHaveBeenCalledWith(mockFamilies[0].id, {
        display_name: 'น้องใหม่',
        gender: 'other',
      })
    );
  });

  it('sends child-of as a reversed parent relationship', async () => {
    renderAt('/family/people/new');
    fireEvent.change(await screen.findByLabelText(copy['person.display_name.label']), {
      target: { value: 'น้องใหม่' },
    });
    fireEvent.change(screen.getByLabelText(copy['person.relationship.label']), {
      target: { value: mockPeople[0].id },
    });
    fireEvent.click(screen.getByLabelText(copy['relation.type.child']));
    fireEvent.click(screen.getByRole('button', { name: copy['person.save'] }));

    await waitFor(() =>
      expect(familyGraph.createRelationship).toHaveBeenCalledWith(mockFamilies[0].id, {
        person_id: mockPeople[0].id,
        related_person_id: created.id,
        type: 'parent',
      })
    );
  });

  it('sends year-only Buddhist-era birth as YYYY-01-01 with precision year', async () => {
    renderAt('/family/people/new');
    fireEvent.change(await screen.findByLabelText(copy['person.display_name.label']), {
      target: { value: 'น้องใหม่' },
    });
    fireEvent.click(screen.getByRole('switch', { name: copy['person.birth.mode.year'] }));
    fireEvent.change(screen.getByLabelText(copy['person.birth.label']), {
      target: { value: '2561' },
    });
    fireEvent.click(screen.getByRole('button', { name: copy['person.save'] }));

    await waitFor(() =>
      expect(familyGraph.createPerson).toHaveBeenCalledWith(mockFamilies[0].id, {
        display_name: 'น้องใหม่',
        gender: null,
        birth_date: '2018-01-01',
        birth_date_precision: 'year',
      })
    );
  });

  it('prefills the related person from a tree-node query', async () => {
    renderAt(`/family/people/new?related=${mockPeople[0].id}`);
    expect(await screen.findByLabelText(copy['person.relationship.label'])).toHaveValue(mockPeople[0].id);
    expect(screen.getByLabelText(copy['person.relationship.parent'])).toBeTruthy();
  });

  it('shows NAME_REQUIRED inline and does not submit', async () => {
    renderAt('/family/people/new');
    fireEvent.click(await screen.findByRole('button', { name: copy['person.save'] }));
    expect(await screen.findByText(copy['error.NAME_REQUIRED'])).toBeTruthy();
    expect(familyGraph.createPerson).not.toHaveBeenCalled();
  });

  it('shows API NAME_REQUIRED inline on the name field', async () => {
    vi.mocked(familyGraph.createPerson).mockRejectedValue(
      new ApiClientError('NAME_REQUIRED', 'display_name required', 400, 'display_name')
    );
    renderAt('/family/people/new');
    fireEvent.change(await screen.findByLabelText(copy['person.display_name.label']), {
      target: { value: 'น้องใหม่' },
    });
    fireEvent.click(screen.getByRole('button', { name: copy['person.save'] }));
    expect(await screen.findByText(copy['error.NAME_REQUIRED'])).toBeTruthy();
  });

  it('blocks a future birth date with INVALID_BIRTH_DATE copy inline', async () => {
    renderAt('/family/people/new');
    fireEvent.change(await screen.findByLabelText(copy['person.display_name.label']), {
      target: { value: 'น้องใหม่' },
    });
    fireEvent.change(screen.getByLabelText(copy['person.birth.label']), {
      target: { value: '2099-01-01' },
    });
    fireEvent.click(screen.getByRole('button', { name: copy['person.save'] }));

    expect(await screen.findByText(copy['error.INVALID_BIRTH_DATE'])).toBeTruthy();
    expect(familyGraph.createPerson).not.toHaveBeenCalled();
  });

  it('confirms before discarding unsaved changes', async () => {
    renderAt('/family/people/new');
    fireEvent.change(await screen.findByLabelText(copy['person.display_name.label']), {
      target: { value: 'น้องใหม่' },
    });
    fireEvent.click(screen.getByRole('link', { name: 'leave-form' }));
    expect(await screen.findByText(copy['person.unsaved.title'])).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: copy['person.unsaved.stay'] }));
    expect(screen.queryByText('family-page')).toBeNull();
    fireEvent.click(screen.getByRole('link', { name: 'leave-form' }));
    fireEvent.click(await screen.findByRole('button', { name: copy['person.unsaved.leave'] }));
    expect(await screen.findByText('family-page')).toBeTruthy();
  });

  it('saves an edit with unspecified gender as null and keeps birth precision', async () => {
    vi.mocked(familyGraph.updatePerson).mockResolvedValue({
      ...mockPeople[0],
      gender: null,
    });

    renderAt(`/family/people/${mockPeople[0].id}/edit`);
    expect(await screen.findByDisplayValue(mockPeople[0].display_name)).toBeTruthy();
    fireEvent.click(screen.getByLabelText(copy['person.gender.unspecified']));
    fireEvent.click(screen.getByRole('button', { name: copy['person.save'] }));

    await waitFor(() =>
      expect(familyGraph.updatePerson).toHaveBeenCalledWith(mockPeople[0].id, {
        display_name: mockPeople[0].display_name,
        gender: null,
        relation_label: mockPeople[0].relation_label,
        birth_date: mockPeople[0].birth_date,
        birth_date_precision: 'day',
      })
    );
  });

  it('maps INVALID_RELATIONSHIP and RELATIONSHIP_EXISTS onto the form', async () => {
    vi.mocked(familyGraph.createRelationship)
      .mockRejectedValueOnce(new ApiClientError('INVALID_RELATIONSHIP', 'invalid', 400))
      .mockRejectedValueOnce(new ApiClientError('SELF_RELATIONSHIP', 'self', 400))
      .mockRejectedValueOnce(new ApiClientError('RELATIONSHIP_EXISTS', 'exists', 409));

    renderAt('/family/people/new');
    fireEvent.change(await screen.findByLabelText(copy['person.display_name.label']), {
      target: { value: 'น้องใหม่' },
    });
    fireEvent.change(screen.getByLabelText(copy['person.relationship.label']), {
      target: { value: mockPeople[0].id },
    });
    fireEvent.click(screen.getByLabelText(copy['relation.type.child']));
    fireEvent.click(screen.getByRole('button', { name: copy['person.save'] }));
    await waitFor(() => expect(familyGraph.createRelationship).toHaveBeenCalledTimes(1));
    expect(screen.getByText(copy['error.INVALID_RELATIONSHIP'])).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: copy['person.save'] }));
    await waitFor(() => expect(familyGraph.createRelationship).toHaveBeenCalledTimes(2));
    expect(screen.getByText(copy['error.INVALID_RELATIONSHIP'])).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: copy['person.save'] }));
    expect(await screen.findByText(copy['error.RELATIONSHIP_EXISTS'])).toBeTruthy();
  });
});
