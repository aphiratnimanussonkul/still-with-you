import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { copy, interpolate } from '@/copy';
import type { FamilyPerson } from '@/lib/family-graph';
import { mockAccount, mockFamilies, mockMembers, mockPeople, mockRelationships } from '@/mocks/data';

const { actualLayoutFamilyTree } = vi.hoisted(() => ({
  actualLayoutFamilyTree: {
    current: null as null | typeof import('@/lib/family-tree').layoutFamilyTree,
  },
}));

vi.mock('@/lib/api-client', () => ({
  api: {
    listFamilies: vi.fn(),
    createFamily: vi.fn(),
  },
}));

vi.mock('@/lib/family-graph', async () => {
  const actual = await vi.importActual<typeof import('@/lib/family-graph')>('@/lib/family-graph');
  return {
    ...actual,
    familyGraph: {
      listPeople: vi.fn(),
      createPerson: vi.fn(),
      createRelationship: vi.fn(),
      listMembers: vi.fn(),
      listInvites: vi.fn(),
      createInvite: vi.fn(),
    },
  };
});

vi.mock('@/lib/family-tree', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/family-tree')>();
  actualLayoutFamilyTree.current = actual.layoutFamilyTree;
  return {
    ...actual,
    layoutFamilyTree: vi.fn((...args: Parameters<typeof actual.layoutFamilyTree>) =>
      actual.layoutFamilyTree(...args)
    ),
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

import { api } from '@/lib/api-client';
import { familyGraph } from '@/lib/family-graph';
import { layoutFamilyTree } from '@/lib/family-tree';
import { FamilyPage } from '@/pages/FamilyPage';

function productionPerson(id: string, name: string): FamilyPerson {
  return {
    id,
    family_id: mockFamilies[0].id,
    display_name: name,
    name,
    relation_label: null,
    account_id: null,
    is_living: true,
    birth_date: null,
    birth_date_precision: 'day',
    death_date: null,
    death_date_precision: null,
    age: null,
    avatar_url: null,
    avatar_url_expires_at: null,
    avatar_placeholder: null,
    full_url: null,
    full_url_expires_at: null,
    memory_count: 0,
  };
}

function renderPage(path = '/family') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/family" element={<FamilyPage />} />
          <Route path="/family/people/new" element={<div>add-form</div>} />
          <Route path="/family/people/:personId" element={<div>person-page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('FamilyPage', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.mocked(familyGraph.listMembers).mockResolvedValue({ members: mockMembers });
    vi.mocked(layoutFamilyTree).mockImplementation((...args) => actualLayoutFamilyTree.current!(...args));
  });

  it('shows the tree, Buddhist years, and only the add / back-to-me toolbar', async () => {
    vi.mocked(api.listFamilies).mockResolvedValue({ families: mockFamilies });
    vi.mocked(familyGraph.listPeople).mockResolvedValue({
      people: mockPeople,
      relationships: mockRelationships,
    });

    renderPage();
    expect(await screen.findByText('ยาย')).toBeTruthy();
    expect(screen.getByText('ปู่')).toBeTruthy();
    expect(screen.queryByText('ยายสมศรี')).toBeNull();
    expect(screen.getByText('2480–2565')).toBeTruthy();
    expect(screen.getByText('2478–')).toBeTruthy();
    expect(screen.getByRole('button', { name: copy['family.tab.graph'] })).toBeTruthy();
    expect(screen.getByRole('button', { name: copy['family.tab.list'] })).toBeTruthy();
    expect(screen.getByRole('link', { name: copy['person.add.action'] })).toBeTruthy();
    expect(screen.getByRole('button', { name: copy['tree.back_to_me'] })).toBeTruthy();
    expect(screen.queryByText(copy['family.focus.toggle'])).toBeNull();
    expect(screen.queryByText(copy['family.tab.members'])).toBeNull();
  });

  it('opens the node + menu and navigates a node tap to the person page', async () => {
    vi.mocked(api.listFamilies).mockResolvedValue({ families: mockFamilies });
    vi.mocked(familyGraph.listPeople).mockResolvedValue({
      people: mockPeople,
      relationships: mockRelationships,
    });

    renderPage();
    expect(await screen.findByText('ยาย')).toBeTruthy();
    fireEvent.click(screen.getByLabelText(copy['tree.node.add'].replace('{ชื่อ}', 'ยาย')));
    expect(screen.getByText(copy['tree.node.add_parent'])).toBeTruthy();
    expect(screen.getByText(copy['tree.node.add_child'])).toBeTruthy();
    expect(screen.getByText(copy['tree.node.add_spouse'])).toBeTruthy();
    fireEvent.click(screen.getByText('ยาย'));
    expect(await screen.findByText('person-page')).toBeTruthy();
  });

  it('opens the pick-existing sheet instead of the add-person form', async () => {
    const uncle = productionPerson('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10', 'สมศักดิ์');
    vi.mocked(api.listFamilies).mockResolvedValue({ families: mockFamilies });
    vi.mocked(familyGraph.listPeople).mockResolvedValue({
      people: [...mockPeople, uncle],
      relationships: mockRelationships,
    });

    renderPage();
    expect(await screen.findByText('ยาย')).toBeTruthy();
    fireEvent.click(screen.getByLabelText(copy['tree.node.add'].replace('{ชื่อ}', 'ยาย')));
    fireEvent.click(screen.getByText(copy['tree.node.add_spouse']));
    expect(await screen.findByText(copy['relation.pick.subtitle'])).toBeTruthy();
    expect(screen.getAllByText('สมศักดิ์').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: copy['relation.pick.link'] })).toBeTruthy();
    expect(screen.queryByText('add-form')).toBeNull();
  });

  it('disables add-parent when the person already has two parents', async () => {
    vi.mocked(api.listFamilies).mockResolvedValue({ families: mockFamilies });
    vi.mocked(familyGraph.listPeople).mockResolvedValue({
      people: mockPeople,
      relationships: mockRelationships,
    });

    renderPage();
    expect(await screen.findByText('Atta')).toBeTruthy();
    fireEvent.click(screen.getByLabelText(copy['tree.node.add'].replace('{ชื่อ}', 'Atta')));
    expect(screen.getByText(copy['tree.node.add_parent'])).toBeTruthy();
    expect(
      screen.getByText(interpolate(copy['relation.link.error.too_many_parents'], { ชื่อ: 'Atta' }))
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: copy['tree.node.add_parent'] })).toBeNull();
    expect(screen.queryByText(copy['relation.pick.subtitle'])).toBeNull();
  });

  it('focuses the newly linked person on the tree after a successful link', async () => {
    const uncle = productionPerson('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10', 'สมศักดิ์');
    vi.mocked(api.listFamilies).mockResolvedValue({ families: mockFamilies });
    vi.mocked(familyGraph.listPeople).mockResolvedValue({
      people: [...mockPeople, uncle],
      relationships: mockRelationships,
    });
    vi.mocked(familyGraph.createRelationship).mockResolvedValue({
      id: '99999999-9999-4999-8999-999999999996',
      family_id: mockFamilies[0].id,
      person_id: mockPeople[0].id,
      related_person_id: uncle.id,
      type: 'spouse',
      created_by_account_id: mockAccount.id,
      created_at: '2026-10-31T00:00:00.000Z',
    });

    renderPage();
    expect(await screen.findByText('ยาย')).toBeTruthy();
    fireEvent.click(screen.getByLabelText(copy['tree.node.add'].replace('{ชื่อ}', 'ยาย')));
    fireEvent.click(screen.getByText(copy['tree.node.add_spouse']));
    fireEvent.click(await screen.findByRole('button', { name: copy['relation.pick.link'] }));
    await waitFor(() => expect(familyGraph.createRelationship).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'สมศักดิ์' }).getAttribute('aria-current')).toBe('true')
    );
  });

  it('remembers the list tab and sorts by generation', async () => {
    vi.mocked(api.listFamilies).mockResolvedValue({ families: mockFamilies });
    vi.mocked(familyGraph.listPeople).mockResolvedValue({
      people: mockPeople,
      relationships: mockRelationships,
    });

    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: copy['family.tab.list'] }));
    expect(sessionStorage.getItem('swy.family.tab')).toBe('list');
    const links = screen.getAllByRole('link').map((link) => link.textContent);
    expect(links.some((text) => text?.includes('ยายสมศรี'))).toBe(true);
    expect(links.some((text) => text?.includes('Atta'))).toBe(true);
  });

  it('shows the only-self card when the tree is just me', async () => {
    vi.mocked(api.listFamilies).mockResolvedValue({ families: mockFamilies });
    vi.mocked(familyGraph.listPeople).mockResolvedValue({
      people: [mockPeople[2]],
      relationships: [],
    });

    renderPage();
    expect(await screen.findByText(copy['tree.only_self.title'])).toBeTruthy();
    expect(screen.getByText(copy['tree.only_self.body'])).toBeTruthy();
    expect(screen.getByRole('link', { name: copy['person.add.action'] })).toBeTruthy();
    expect(screen.queryByRole('button', { name: copy['tree.back_to_me'] })).toBeNull();
  });

  it('renders people with no relationships as tree nodes', async () => {
    vi.mocked(api.listFamilies).mockResolvedValue({ families: mockFamilies });
    vi.mocked(familyGraph.listPeople).mockResolvedValue({
      people: [
        productionPerson('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'สมศรี'),
        productionPerson('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'สมชาย'),
      ],
      relationships: [],
    });

    renderPage();
    expect(await screen.findByText('สมศรี')).toBeTruthy();
    expect(screen.getByText('สมชาย')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'สมศรี' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'สมชาย' })).toBeTruthy();
    expect(screen.queryByText(copy['tree.fallback_list.title'])).toBeNull();
  });

  it('shows the empty state when the family has no people', async () => {
    vi.mocked(api.listFamilies).mockResolvedValue({ families: mockFamilies });
    vi.mocked(familyGraph.listPeople).mockResolvedValue({
      people: [],
      relationships: [],
    });

    renderPage();
    expect(await screen.findByText(copy['tree.only_self.title'])).toBeTruthy();
    expect(screen.getByText(copy['tree.only_self.body'])).toBeTruthy();
    expect(screen.queryByText(copy['tree.fallback_list.title'])).toBeNull();
  });

  it('shows the fallback list when tree layout throws', async () => {
    vi.mocked(api.listFamilies).mockResolvedValue({ families: mockFamilies });
    vi.mocked(familyGraph.listPeople).mockResolvedValue({
      people: mockPeople,
      relationships: mockRelationships,
    });
    vi.mocked(layoutFamilyTree).mockImplementation(() => {
      throw new Error('forced layout throw');
    });

    renderPage();
    expect(await screen.findByText(copy['tree.fallback_list.title'])).toBeTruthy();
    expect(screen.getByText(copy['tree.fallback_list.body'])).toBeTruthy();
    expect(screen.getByText('ยายสมศรี')).toBeTruthy();
    expect(screen.getByText('ปู่สมชาย')).toBeTruthy();
    expect(screen.getByText('Atta')).toBeTruthy();
  });

  it('hides add-person entry points when the viewer is not an admin', async () => {
    const unrelated = {
      ...mockPeople[2],
      id: '99999999-9999-4999-8999-999999999999',
      display_name: 'โอ๊ต',
      name: 'โอ๊ต',
      relation_label: null,
      account_id: null,
    };
    vi.mocked(api.listFamilies).mockResolvedValue({ families: mockFamilies });
    vi.mocked(familyGraph.listPeople).mockResolvedValue({
      people: [...mockPeople, unrelated],
      relationships: mockRelationships,
    });
    vi.mocked(familyGraph.listMembers).mockResolvedValue({
      members: mockMembers.map((member) => ({ ...member, role: 'member' as const })),
    });

    renderPage();
    expect(await screen.findByText('ยาย')).toBeTruthy();
    expect(screen.getByText('โอ๊ต')).toBeTruthy();
    expect(screen.queryByRole('link', { name: copy['person.add.action'] })).toBeNull();
    expect(screen.queryByLabelText(copy['tree.node.add'].replace('{ชื่อ}', 'ยาย'))).toBeNull();
    expect(screen.queryByText(copy['tree.node.add_parent'])).toBeNull();
    expect(screen.getByRole('button', { name: copy['tree.back_to_me'] })).toBeTruthy();
    expect(screen.queryByText(copy['tree.unrelated.body'])).toBeNull();
    expect(screen.queryByText(copy['tree.readonly.note'])).toBeNull();
  });

  it('keeps retry when the people list fails', async () => {
    vi.mocked(api.listFamilies).mockResolvedValue({ families: mockFamilies });
    vi.mocked(familyGraph.listPeople).mockRejectedValue(new Error('boom'));

    renderPage();
    expect(await screen.findByText(copy['error.generic'])).toBeTruthy();
    expect(screen.getByRole('button', { name: copy['common.retry'] })).toBeTruthy();
    await waitFor(() => expect(screen.queryByText('ยายสมศรี')).toBeNull());
  });
});
