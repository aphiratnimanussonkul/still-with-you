import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { copy, interpolate } from '@/copy';
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

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.mocked(api.listFamilies).mockResolvedValue({ families: mockFamilies });
  vi.mocked(familyGraph.listPeople).mockResolvedValue({ people: mockPeople, relationships: [] });
  vi.mocked(familyGraph.listMembers).mockResolvedValue({ members: mockMembers });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/family/people/new" element={<AddPersonPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('AddPersonPage', () => {
  it('orders photo, name, relationship-to-me, living, and เพิ่มในผัง', async () => {
    renderAt('/family/people/new');
    expect(await screen.findByTestId('photo-field')).toBeTruthy();
    expect(screen.getByLabelText(copy['person.name_label'])).toBeTruthy();
    const selects = await screen.findAllByRole('combobox');
    expect(selects).toHaveLength(2);
    expect((selects[1] as HTMLSelectElement).value).toBe(mockPeople[2].id);
    expect((screen.getByLabelText(copy['person.living']) as HTMLButtonElement).getAttribute('data-state')).toBe(
      'checked'
    );
    expect(screen.getByRole('button', { name: copy['person.add.submit'] })).toBeTruthy();
    expect(screen.queryByLabelText(copy['person.relation_label'])).toBeNull();
  });

  it('prefills kind from the tree + menu and stays on the form with an invite card after save', async () => {
    vi.mocked(familyGraph.createPerson).mockResolvedValue({
      person: {
        id: '99999999-9999-4999-8999-999999999991',
        family_id: mockFamilies[0].id,
        display_name: 'น้องใหม่',
        name: 'น้องใหม่',
        is_living: true,
        account_id: null,
      },
      relationship: null,
    });

    renderAt(`/family/people/new?kind=child_of&person=${mockPeople[2].id}`);
    expect(await screen.findByDisplayValue(copy['person.relationship.child'])).toBeTruthy();
    fireEvent.change(screen.getByLabelText(copy['person.name_label']), { target: { value: 'น้องใหม่' } });
    fireEvent.click(screen.getByRole('button', { name: copy['person.add.submit'] }));
    await waitFor(() =>
      expect(familyGraph.createPerson).toHaveBeenCalledWith(
        mockFamilies[0].id,
        expect.objectContaining({
          display_name: 'น้องใหม่',
          is_living: true,
          relationship: { kind: 'child_of', person_id: mockPeople[2].id },
        })
      )
    );
    expect(
      await screen.findByText(interpolate(copy['person.invite.after.title'], { ชื่อ: 'น้องใหม่' }))
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: copy['person.invite.after.action'] })).toBeTruthy();
    expect(screen.queryByText('person-page')).toBeNull();
  });

  it('hides the invite card for a deceased person', async () => {
    vi.mocked(familyGraph.createPerson).mockResolvedValue({
      person: {
        id: '99999999-9999-4999-8999-999999999992',
        family_id: mockFamilies[0].id,
        display_name: 'ทวด',
        name: 'ทวด',
        is_living: false,
        account_id: null,
      },
      relationship: null,
    });

    renderAt('/family/people/new');
    fireEvent.change(await screen.findByLabelText(copy['person.name_label']), { target: { value: 'ทวด' } });
    fireEvent.click(screen.getByLabelText(copy['person.living']));
    fireEvent.click(screen.getByRole('button', { name: copy['person.add.submit'] }));
    await waitFor(() => expect(familyGraph.createPerson).toHaveBeenCalled());
    expect(screen.queryByText(interpolate(copy['person.invite.after.title'], { ชื่อ: 'ทวด' }))).toBeNull();
  });
});
