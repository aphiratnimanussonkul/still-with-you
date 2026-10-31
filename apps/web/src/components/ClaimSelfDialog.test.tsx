import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClaimSelfDialog } from '@/components/ClaimSelfDialog';
import { copy, interpolate, interpolateHeading } from '@/copy';
import { ApiClientError } from '@/lib/api-errors';
import { mockAccount, mockFamilies, mockPeople } from '@/mocks/data';

vi.mock('sonner', () => {
  const toast = Object.assign(vi.fn(), { success: vi.fn() });
  return { toast };
});

vi.mock('@/lib/family-graph', async () => {
  const actual = await vi.importActual<typeof import('@/lib/family-graph')>('@/lib/family-graph');
  return {
    ...actual,
    familyGraph: {
      claimPerson: vi.fn(),
    },
  };
});

import { toast } from 'sonner';
import { familyGraph } from '@/lib/family-graph';

const person = { ...mockPeople[1], account_id: null, is_living: true };

function renderDialog() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ClaimSelfDialog person={person} familyId={mockFamilies[0].id} open onOpenChange={vi.fn()} />
    </QueryClientProvider>
  );
}

describe('ClaimSelfDialog', () => {
  beforeEach(() => {
    vi.mocked(familyGraph.claimPerson).mockReset();
    vi.mocked(toast).mockReset();
  });

  it('confirms and toasts when claim succeeds', async () => {
    vi.mocked(familyGraph.claimPerson).mockResolvedValue({ ...person, account_id: mockAccount.id });
    renderDialog();
    expect(
      screen.getByText(interpolateHeading(copy['person.claim_self.confirm.title'], { ชื่อ: person.display_name }))
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: copy['person.claim_self.confirm.primary'] }));
    await waitFor(() => expect(familyGraph.claimPerson).toHaveBeenCalledWith(person.id));
    expect(toast).toHaveBeenCalledWith(
      interpolate(copy['person.claim_self.done'], { ชื่อ: person.display_name })
    );
  });

  it('shows coded 409s with เข้าใจแล้ว and no retry', async () => {
    vi.mocked(familyGraph.claimPerson).mockRejectedValue(
      new ApiClientError('PERSON_ALREADY_CLAIMED', 'taken', 409)
    );
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: copy['person.claim_self.confirm.primary'] }));
    expect(
      await screen.findByText(interpolate(copy['person.claim_self.taken'], { ชื่อ: person.display_name }))
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: copy['person.error.ok'] })).toBeTruthy();
    expect(screen.queryByRole('button', { name: copy['common.retry'] })).toBeNull();
    expect(screen.queryByRole('button', { name: copy['person.claim_self.confirm.primary'] })).toBeNull();
  });

  it('uses details.display_name for ACCOUNT_ALREADY_LINKED', async () => {
    vi.mocked(familyGraph.claimPerson).mockRejectedValue(
      new ApiClientError('ACCOUNT_ALREADY_LINKED', 'linked', 409, undefined, {
        person_id: mockPeople[2].id,
        display_name: 'ใบเตย',
      })
    );
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: copy['person.claim_self.confirm.primary'] }));
    expect(
      await screen.findByText(interpolate(copy['person.claim_self.already_linked_self'], { ชื่อเดิม: 'ใบเตย' }))
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: copy['person.error.ok'] })).toBeTruthy();
  });

  it('maps PERSON_DELETED to person_gone and PERSON_DECEASED to the deceased line', async () => {
    vi.mocked(familyGraph.claimPerson).mockRejectedValue(
      new ApiClientError('PERSON_DELETED', 'gone', 422)
    );
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: copy['person.claim_self.confirm.primary'] }));
    expect(
      await screen.findByText(interpolate(copy['relation.link.error.person_gone'], { ชื่อ: person.display_name }))
    ).toBeTruthy();
  });

  it('keeps retry for other errors', async () => {
    vi.mocked(familyGraph.claimPerson)
      .mockRejectedValueOnce(new ApiClientError('INTERNAL_ERROR', 'boom', 500))
      .mockResolvedValueOnce({ ...person, account_id: mockAccount.id });
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: copy['person.claim_self.confirm.primary'] }));
    expect(await screen.findByText(copy['person.claim_self.failed'])).toBeTruthy();
    expect(familyGraph.claimPerson).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: copy['common.retry'] }));
    await waitFor(() => expect(familyGraph.claimPerson).toHaveBeenCalledTimes(2));
    expect(toast).toHaveBeenCalledWith(
      interpolate(copy['person.claim_self.done'], { ชื่อ: person.display_name })
    );
  });
});
