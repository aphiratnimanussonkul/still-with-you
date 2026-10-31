import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useSearchParams } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { copy, interpolate } from '@/copy';
import { ApiClientError } from '@/lib/api-errors';
import type { FamilyPerson } from '@/lib/family-graph';
import { mockFamilies, mockPeople, mockRelationships } from '@/mocks/data';

vi.mock('@/lib/family-graph', async () => {
  const actual = await vi.importActual<typeof import('@/lib/family-graph')>('@/lib/family-graph');
  return {
    ...actual,
    familyGraph: {
      createRelationship: vi.fn(),
    },
  };
});

vi.mock('sonner', () => ({
  toast: vi.fn(),
}));

import { PickExistingPersonSheet } from '@/components/PickExistingPersonSheet';
import { familyGraph } from '@/lib/family-graph';
import { toast } from 'sonner';

const uncle: FamilyPerson = {
  ...mockPeople[0],
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10',
  display_name: 'สมศักดิ์',
  name: 'สมศักดิ์',
  relation_label: 'ลุง',
  account_id: null,
};

const cousin: FamilyPerson = {
  ...mockPeople[0],
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11',
  display_name: 'มะปราง',
  name: 'มะปราง',
  relation_label: 'หลาน',
  account_id: null,
};

function AddFormLocation() {
  const [params] = useSearchParams();
  return (
    <div>
      add-form
      <span>{params.toString()}</span>
    </div>
  );
}

function renderSheet(
  overrides?: Partial<ComponentProps<typeof PickExistingPersonSheet>>
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onOpenChange = vi.fn();
  const onLinked = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/family']}>
        <Routes>
          <Route
            path="/family"
            element={
              <PickExistingPersonSheet
                open
                onOpenChange={onOpenChange}
                familyId={mockFamilies[0].id}
                subject={mockPeople[2]}
                kind="spouse"
                people={[...mockPeople, uncle, cousin]}
                relationships={mockRelationships}
                onLinked={onLinked}
                {...overrides}
              />
            }
          />
          <Route path="/family/people/new" element={<AddFormLocation />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
  return { onOpenChange, onLinked };
}

describe('PickExistingPersonSheet', () => {
  beforeEach(() => {
    vi.mocked(familyGraph.createRelationship).mockReset();
    vi.mocked(toast).mockReset();
  });

  it('lists pickable people and hides self plus already-related rows', async () => {
    renderSheet();
    expect(
      await screen.findByText(
        interpolate(copy['relation.pick.title.spouse'], { ชื่อ: mockPeople[2].display_name })
      )
    ).toBeTruthy();
    expect(screen.getByText(copy['relation.pick.section.existing'])).toBeTruthy();
    expect(screen.getByText('สมศักดิ์')).toBeTruthy();
    expect(screen.getByText('ลุง')).toBeTruthy();
    expect(screen.getByText('มะปราง')).toBeTruthy();
    expect(screen.queryByText('ยายสมศรี')).toBeNull();
    expect(screen.queryByText('ปู่สมชาย')).toBeNull();
    expect(screen.getAllByRole('button', { name: copy['relation.pick.link'] })).toHaveLength(2);
  });

  it('filters the list by display name and nickname', async () => {
    renderSheet();
    expect(await screen.findByText('สมศักดิ์')).toBeTruthy();
    fireEvent.change(screen.getByLabelText(copy['relation.pick.search.placeholder']), {
      target: { value: 'ลุง' },
    });
    expect(screen.getByText('สมศักดิ์')).toBeTruthy();
    expect(screen.queryByText('มะปราง')).toBeNull();
  });

  it('links immediately with a spouse payload, toasts, and closes', async () => {
    vi.mocked(familyGraph.createRelationship).mockResolvedValue({
      id: '99999999-9999-4999-8999-999999999999',
      family_id: mockFamilies[0].id,
      person_id: mockPeople[2].id,
      related_person_id: uncle.id,
      type: 'spouse',
      created_by_account_id: mockPeople[2].account_id ?? mockPeople[2].id,
      created_at: '2026-10-31T00:00:00.000Z',
    });
    const { onOpenChange, onLinked } = renderSheet();
    fireEvent.click((await screen.findAllByRole('button', { name: copy['relation.pick.link'] }))[0]);
    await waitFor(() =>
      expect(familyGraph.createRelationship).toHaveBeenCalledWith(mockFamilies[0].id, {
        person_id: mockPeople[2].id,
        related_person_id: uncle.id,
        type: 'spouse',
      })
    );
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        interpolate(copy['relation.link.toast'], {
          ชื่อ: mockPeople[2].display_name,
          อีกคน: uncle.display_name,
        })
      )
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onLinked).toHaveBeenCalledWith(uncle);
  });

  it('sends parent and child payloads in the documented direction', async () => {
    vi.mocked(familyGraph.createRelationship).mockResolvedValue({
      id: '99999999-9999-4999-8999-999999999998',
      family_id: mockFamilies[0].id,
      person_id: uncle.id,
      related_person_id: mockPeople[2].id,
      type: 'parent',
      created_by_account_id: mockPeople[2].account_id ?? mockPeople[2].id,
      created_at: '2026-10-31T00:00:00.000Z',
    });
    renderSheet({ kind: 'parent' });
    fireEvent.click((await screen.findAllByRole('button', { name: copy['relation.pick.link'] }))[0]);
    await waitFor(() =>
      expect(familyGraph.createRelationship).toHaveBeenCalledWith(mockFamilies[0].id, {
        person_id: uncle.id,
        related_person_id: mockPeople[2].id,
        type: 'parent',
      })
    );
  });

  it('shows inline retry on generic errors and no retry on specific API errors', async () => {
    vi.mocked(familyGraph.createRelationship).mockRejectedValueOnce(new Error('boom'));
    renderSheet();
    fireEvent.click((await screen.findAllByRole('button', { name: copy['relation.pick.link'] }))[0]);
    expect(await screen.findByText(copy['relation.link.error.inline'])).toBeTruthy();
    expect(screen.getByRole('button', { name: copy['common.retry'] })).toBeTruthy();

    vi.mocked(familyGraph.createRelationship).mockRejectedValueOnce(
      new ApiClientError('RELATIONSHIP_EXISTS', 'exists', 409)
    );
    fireEvent.click(screen.getByRole('button', { name: copy['common.retry'] }));
    expect(await screen.findByText(copy['error.RELATIONSHIP_EXISTS'])).toBeTruthy();
    expect(screen.queryByRole('button', { name: copy['common.retry'] })).toBeNull();
  });

  it('shows person_gone without retry', async () => {
    vi.mocked(familyGraph.createRelationship).mockRejectedValue(
      new ApiClientError('INVALID_INPUT', 'gone', 400)
    );
    renderSheet();
    fireEvent.click((await screen.findAllByRole('button', { name: copy['relation.pick.link'] }))[0]);
    expect(
      await screen.findByText(interpolate(copy['relation.link.error.person_gone'], { ชื่อ: uncle.display_name }))
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: copy['common.retry'] })).toBeNull();
  });

  it('disables other rows while saving', async () => {
    let resolveLink: (() => void) | undefined;
    vi.mocked(familyGraph.createRelationship).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveLink = () =>
            resolve({
              id: '99999999-9999-4999-8999-999999999997',
              family_id: mockFamilies[0].id,
              person_id: mockPeople[2].id,
              related_person_id: uncle.id,
              type: 'spouse',
              created_by_account_id: mockPeople[2].account_id ?? mockPeople[2].id,
              created_at: '2026-10-31T00:00:00.000Z',
            });
        })
    );
    renderSheet();
    const buttons = await screen.findAllByRole('button', { name: copy['relation.pick.link'] });
    fireEvent.click(buttons[0]);
    expect(await screen.findByText(copy['relation.link.saving'])).toBeTruthy();
    expect(screen.getByRole('button', { name: copy['relation.pick.add_new'] })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: copy['relation.pick.link'] })).toHaveProperty('disabled', true);
    resolveLink?.();
    await waitFor(() => expect(toast).toHaveBeenCalled());
  });

  it('shows the empty state with เพิ่มคนใหม่ as the primary action', async () => {
    renderSheet({ people: mockPeople, relationships: mockRelationships });
    expect(await screen.findByText(copy['relation.pick.empty'])).toBeTruthy();
    expect(screen.getByRole('button', { name: copy['relation.pick.add_new'] })).toBeTruthy();
    expect(screen.queryByText(copy['relation.pick.section.existing'])).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: copy['relation.pick.add_new'] }));
    expect(await screen.findByText('add-form')).toBeTruthy();
  });

  it('prefills the typed name when adding as new from a search miss', async () => {
    renderSheet();
    fireEvent.change(await screen.findByLabelText(copy['relation.pick.search.placeholder']), {
      target: { value: 'น้องใหม่' },
    });
    expect(screen.getByText(interpolate(copy['relation.pick.search.empty'], { คำค้น: 'น้องใหม่' }))).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', {
        name: interpolate(copy['relation.pick.search.add'], { คำค้น: 'น้องใหม่' }),
      })
    );
    expect(await screen.findByText('add-form')).toBeTruthy();
    expect(
      screen.getByText(`kind=spouse_of&person=${mockPeople[2].id}&name=${encodeURIComponent('น้องใหม่')}`)
    ).toBeTruthy();
  });
});
