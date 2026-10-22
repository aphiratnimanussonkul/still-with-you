import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { copy } from '@/copy';
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
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/family/people/new" element={<PersonFormPage />} />
          <Route path="/family/people/:personId/edit" element={<PersonFormPage />} />
          <Route path="/family/people/:personId" element={<p>person-page</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

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
  });

  it('shows Eddy labels and maps gender radios to male/female/null', async () => {
    const created = { ...mockPeople[0], id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', display_name: 'น้องใหม่' };
    vi.mocked(familyGraph.createPerson).mockResolvedValue(created);
    vi.mocked(familyGraph.createRelationship).mockResolvedValue({
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      person_id: created.id,
      related_person_id: mockPeople[0].id,
      type: 'parent',
    });

    renderAt('/family/people/new');
    expect(await screen.findByLabelText(copy['person.display_name.label'])).toBeTruthy();
    expect(screen.getByText(copy['person.family_name.label'])).toBeTruthy();
    expect(screen.getByText(copy['person.gender.label'])).toBeTruthy();
    expect(screen.getByText(copy['person.birth.hint'])).toBeTruthy();
    expect(screen.getByTestId('photo-attach').textContent).toBe(copy['person.avatar.label']);
    expect(screen.getByLabelText(copy['person.gender.male'])).toBeTruthy();
    expect(screen.getByLabelText(copy['person.gender.female'])).toBeTruthy();
    expect(screen.getByLabelText(copy['person.gender.unspecified'])).toBeTruthy();

    fireEvent.change(screen.getByLabelText(copy['person.display_name.label']), {
      target: { value: 'น้องใหม่' },
    });
    fireEvent.click(screen.getByLabelText(copy['person.gender.male']));
    fireEvent.change(screen.getByLabelText(copy['person.birth.label']), {
      target: { value: '2018-04-12' },
    });
    fireEvent.change(screen.getByLabelText(copy['person.relationship.label']), {
      target: { value: 'parent' },
    });
    fireEvent.change(screen.getByLabelText(copy['person.relationship.related']), {
      target: { value: mockPeople[0].id },
    });
    fireEvent.click(screen.getByRole('button', { name: copy['person.save'] }));

    await waitFor(() =>
      expect(familyGraph.createPerson).toHaveBeenCalledWith(mockFamilies[0].id, {
        display_name: 'น้องใหม่',
        gender: 'male',
        birth_date: '2018-04-12',
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

  it('blocks a future birth date with INVALID_BIRTH_DATE copy', async () => {
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

  it('saves an edit with unspecified gender as null', async () => {
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
        birth_date: mockPeople[0].birth_date,
      })
    );
  });
});
