import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { copy, interpolate, personRelationLabel } from '@/copy';
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
      listPeople: vi.fn(),
      listMembers: vi.fn(),
      createPerson: vi.fn(),
      createPersonInvite: vi.fn(),
    },
  };
});

vi.mock('@/hooks/use-me', () => ({
  useMe: () => ({
    data: { id: mockAccount.id, display_name: mockAccount.display_name },
  }),
}));

vi.mock('@/components/Illustration', () => ({
  Illustration: () => <div data-testid="illustration" />,
}));

vi.mock('@/components/PersonPhotoField', () => ({
  PersonPhotoField: () => <div data-testid="photo-field" />,
}));

import { api } from '@/lib/api-client';
import { familyGraph } from '@/lib/family-graph';
import { AddPersonPage } from '@/pages/AddPersonPage';

function renderAt(path: string, members = mockMembers) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.mocked(api.listFamilies).mockResolvedValue({ families: mockFamilies });
  vi.mocked(familyGraph.listPeople).mockResolvedValue({ people: mockPeople, relationships: [] });
  vi.mocked(familyGraph.listMembers).mockResolvedValue({ members });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/family" element={<p>family-page</p>} />
          <Route path="/family/people/new" element={<AddPersonPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('AddPersonPage', () => {
  it('orders photo, name, nickname, relationship-to-me, living, and เพิ่มในผัง', async () => {
    renderAt('/family/people/new');
    expect(await screen.findByTestId('photo-field')).toBeTruthy();
    expect(screen.getByLabelText(copy['person.name.label'])).toBeTruthy();
    expect(screen.getByLabelText(copy['person.nickname.label'])).toBeTruthy();
    expect(screen.getByPlaceholderText(copy['person.nickname.placeholder'])).toBeTruthy();
    const selects = await screen.findAllByRole('combobox');
    expect(selects).toHaveLength(2);
    expect((selects[1] as HTMLSelectElement).value).toBe(mockPeople[2].id);
    expect((screen.getByLabelText(copy['person.living']) as HTMLButtonElement).getAttribute('data-state')).toBe(
      'checked'
    );
    expect(screen.getByRole('button', { name: copy['person.add.submit'] })).toBeTruthy();
    expect(screen.getAllByLabelText(personRelationLabel(null)).length).toBeGreaterThan(0);
    expect(screen.getByRole('option', { name: copy['person.relationship.parent'] })).toBeTruthy();
    expect(screen.getByRole('option', { name: copy['person.relationship.child'] })).toBeTruthy();
    expect(screen.getByRole('option', { name: copy['person.relationship.spouse'] })).toBeTruthy();
  });

  it('prefills the typed name from the pick-existing search', async () => {
    renderAt(`/family/people/new?kind=spouse_of&person=${mockPeople[2].id}&name=${encodeURIComponent('น้องใหม่')}`);
    expect(await screen.findByDisplayValue('น้องใหม่')).toBeTruthy();
    expect(screen.getByDisplayValue(copy['person.relationship.spouse'])).toBeTruthy();
  });

  it('labels the relationship as เป็นอะไรกับ {ชื่อ} when the target is not me', async () => {
    renderAt(`/family/people/new?kind=parent_of&person=${mockPeople[0].id}`);
    expect(
      await screen.findAllByLabelText(
        personRelationLabel(mockPeople[0].display_name)
      )
    ).not.toHaveLength(0);
  });

  it('prefills kind from the tree + menu and stays on the form with an invite card after save', async () => {
    vi.mocked(familyGraph.createPerson).mockResolvedValue({
      person: {
        id: '99999999-9999-4999-8999-999999999991',
        family_id: mockFamilies[0].id,
        display_name: 'น้องใหม่',
        name: 'น้องใหม่',
        is_living: true,
        death_date: null,
        death_date_precision: null,
        account_id: null,
        avatar_url: null,
        avatar_url_expires_at: null,
        avatar_placeholder: null,
        full_url: null,
        full_url_expires_at: null,
        memory_count: 0,
      },
      relationship: null,
    });

    renderAt(`/family/people/new?kind=child_of&person=${mockPeople[2].id}`);
    expect(await screen.findByDisplayValue(copy['person.relationship.child'])).toBeTruthy();
    fireEvent.change(screen.getByLabelText(copy['person.name.label']), { target: { value: 'น้องใหม่' } });
    fireEvent.change(screen.getByLabelText(copy['person.nickname.label']), { target: { value: 'น้อง' } });
    fireEvent.click(screen.getByRole('button', { name: copy['person.add.submit'] }));
    await waitFor(() =>
      expect(familyGraph.createPerson).toHaveBeenCalledWith(
        mockFamilies[0].id,
        expect.objectContaining({
          display_name: 'น้องใหม่',
          relation_label: 'น้อง',
          is_living: true,
          death_date: null,
          death_date_precision: null,
          relationship: { kind: 'child_of', person_id: mockPeople[2].id },
        })
      )
    );
    expect(
      await screen.findByText(interpolate(copy['person.invite.after.title'], { ชื่อ: 'น้องใหม่' }))
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: copy['person.invite.after.action'] })).toBeTruthy();
    expect(screen.queryByText('person-page')).toBeNull();
    const payload = vi.mocked(familyGraph.createPerson).mock.calls[0]?.[1];
    expect(payload).toHaveProperty('relation_label', 'น้อง');
    expect(payload).not.toHaveProperty('relation_label', undefined);
  });

  it('sends a full death date with day precision', async () => {
    vi.mocked(familyGraph.createPerson).mockResolvedValue({
      person: {
        id: '99999999-9999-4999-8999-999999999993',
        family_id: mockFamilies[0].id,
        display_name: 'ทวดวัน',
        name: 'ทวดวัน',
        is_living: false,
        death_date: '2022-03-15',
        death_date_precision: 'day',
        account_id: null,
        avatar_url: null,
        avatar_url_expires_at: null,
        avatar_placeholder: null,
        full_url: null,
        full_url_expires_at: null,
        memory_count: 0,
      },
      relationship: null,
    });

    renderAt('/family/people/new');
    fireEvent.change(await screen.findByLabelText(copy['person.name.label']), {
      target: { value: 'ทวดวัน' },
    });
    fireEvent.click(screen.getByLabelText(copy['person.living']));
    expect(screen.getByLabelText(copy['person.death.label'])).toBeTruthy();
    expect((screen.getByLabelText(copy['person.death.label']) as HTMLInputElement).type).toBe('date');
    expect(screen.getByRole('switch', { name: copy['person.death.year_only'] }).getAttribute('aria-checked')).toBe(
      'false'
    );
    fireEvent.change(screen.getByLabelText(copy['person.death.label']), {
      target: { value: '2022-03-15' },
    });
    fireEvent.click(screen.getByRole('button', { name: copy['person.add.submit'] }));
    await waitFor(() =>
      expect(familyGraph.createPerson).toHaveBeenCalledWith(
        mockFamilies[0].id,
        expect.objectContaining({
          display_name: 'ทวดวัน',
          is_living: false,
          death_date: '2022-03-15',
          death_date_precision: 'day',
        })
      )
    );
  });

  it('toggles year-only death and sends January 1 with year precision', async () => {
    vi.mocked(familyGraph.createPerson).mockResolvedValue({
      person: {
        id: '99999999-9999-4999-8999-999999999994',
        family_id: mockFamilies[0].id,
        display_name: 'ทวดปี',
        name: 'ทวดปี',
        is_living: false,
        death_date: '2022-01-01',
        death_date_precision: 'year',
        account_id: null,
        avatar_url: null,
        avatar_url_expires_at: null,
        avatar_placeholder: null,
        full_url: null,
        full_url_expires_at: null,
        memory_count: 0,
      },
      relationship: null,
    });

    renderAt('/family/people/new');
    fireEvent.change(await screen.findByLabelText(copy['person.name.label']), {
      target: { value: 'ทวดปี' },
    });
    fireEvent.click(screen.getByLabelText(copy['person.living']));
    fireEvent.click(screen.getByRole('switch', { name: copy['person.death.year_only'] }));
    expect(screen.getByRole('switch', { name: copy['person.death.year_only'] }).getAttribute('aria-checked')).toBe(
      'true'
    );
    fireEvent.change(screen.getByLabelText(copy['person.death.label']), { target: { value: '2565' } });
    fireEvent.click(screen.getByRole('button', { name: copy['person.add.submit'] }));
    await waitFor(() =>
      expect(familyGraph.createPerson).toHaveBeenCalledWith(
        mockFamilies[0].id,
        expect.objectContaining({
          display_name: 'ทวดปี',
          is_living: false,
          death_date: '2022-01-01',
          death_date_precision: 'year',
        })
      )
    );
  });

  it('hides the invite card for a deceased person', async () => {
    vi.mocked(familyGraph.createPerson).mockResolvedValue({
      person: {
        id: '99999999-9999-4999-8999-999999999992',
        family_id: mockFamilies[0].id,
        display_name: 'ทวด',
        name: 'ทวด',
        is_living: false,
        death_date: null,
        death_date_precision: null,
        account_id: null,
        avatar_url: null,
        avatar_url_expires_at: null,
        avatar_placeholder: null,
        full_url: null,
        full_url_expires_at: null,
        memory_count: 0,
      },
      relationship: null,
    });

    renderAt('/family/people/new');
    fireEvent.change(await screen.findByLabelText(copy['person.name.label']), { target: { value: 'ทวด' } });
    fireEvent.click(screen.getByLabelText(copy['person.living']));
    fireEvent.click(screen.getByRole('button', { name: copy['person.add.submit'] }));
    await waitFor(() => expect(familyGraph.createPerson).toHaveBeenCalled());
    expect(screen.queryByText(interpolate(copy['person.invite.after.title'], { ชื่อ: 'ทวด' }))).toBeNull();
  });

  it('maps POST field relationship.person_id onto the relationship picker', async () => {
    vi.mocked(familyGraph.createPerson).mockRejectedValue(
      new ApiClientError('INVALID_RELATIONSHIP', 'invalid related person', 400, 'relationship.person_id')
    );

    renderAt(`/family/people/new?kind=child_of&person=${mockPeople[2].id}`);
    fireEvent.change(await screen.findByLabelText(copy['person.name.label']), {
      target: { value: 'น้องใหม่' },
    });
    fireEvent.click(screen.getByRole('button', { name: copy['person.add.submit'] }));
    await waitFor(() => expect(familyGraph.createPerson).toHaveBeenCalled());
    const picker = document.getElementById('person-related');
    expect(picker?.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText(copy['error.INVALID_INPUT'])).toBeTruthy();
    expect(document.getElementById('person-related-error')).toBeTruthy();
  });

  it('sends a non-admin away from add-person to the family tree', async () => {
    renderAt(
      '/family/people/new',
      mockMembers.map((member) => ({ ...member, role: 'member' as const }))
    );
    expect(await screen.findByText('family-page')).toBeTruthy();
    expect(screen.queryByRole('button', { name: copy['person.add.submit'] })).toBeNull();
  });
});
