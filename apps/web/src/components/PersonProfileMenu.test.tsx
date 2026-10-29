import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PersonProfileMenu } from '@/components/PersonProfileMenu';
import { copy, interpolateHeading } from '@/copy';
import { ApiClientError } from '@/lib/api-errors';
import { mockFamilies, mockPeople } from '@/mocks/data';

vi.mock('@/lib/family-graph', async () => {
  const actual = await vi.importActual<typeof import('@/lib/family-graph')>('@/lib/family-graph');
  return {
    ...actual,
    familyGraph: {
      deletePerson: vi.fn(),
    },
  };
});

import { familyGraph } from '@/lib/family-graph';

function renderMenu(person = mockPeople[0]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [
      { path: '/family/people/:personId', element: <PersonProfileMenu person={person} familyId={mockFamilies[0].id} /> },
      { path: '/family', element: <p>family-page</p> },
    ],
    { initialEntries: [`/family/people/${person.id}`] }
  );
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}

describe('PersonProfileMenu', () => {
  beforeEach(() => {
    vi.mocked(familyGraph.deletePerson).mockReset();
  });

  it('shows PERSON_LINKED with person.delete.linked after a 409', async () => {
    vi.mocked(familyGraph.deletePerson).mockRejectedValue(
      new ApiClientError('PERSON_LINKED', 'linked', 409)
    );
    renderMenu();
    fireEvent.click(screen.getByRole('button', { name: copy['a11y.more'] }));
    fireEvent.click(await screen.findByRole('button', { name: copy['person.delete.action'] }));
    fireEvent.click(screen.getByRole('button', { name: copy['person.delete.confirm.primary'] }));
    expect(
      await screen.findByText(
        interpolateHeading(copy['person.delete.linked'], { ชื่อ: mockPeople[0].display_name })
      )
    ).toBeTruthy();
    expect(screen.queryByText('family-page')).toBeNull();
    await waitFor(() => expect(familyGraph.deletePerson).toHaveBeenCalledWith(mockPeople[0].id));
  });
});
