import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { copy, interpolate } from '@/copy';
import { mockTrash } from '@/mocks/data';

vi.mock('@/lib/family-graph', () => ({
  familyGraph: {
    listTrash: vi.fn(),
  },
}));

vi.mock('@/components/Illustration', () => ({
  Illustration: () => <div data-testid="illustration" />,
}));

import { familyGraph } from '@/lib/family-graph';
import { TrashPage } from '@/pages/TrashPage';

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TrashPage />
    </QueryClientProvider>
  );
}

describe('TrashPage', () => {
  it('lists items from every family with memory + family meta', async () => {
    vi.mocked(familyGraph.listTrash).mockResolvedValue({ items: mockTrash });
    renderPage();

    expect(await screen.findByText('เรื่องจากบ้านเรา')).toBeTruthy();
    expect(screen.getByText('เรื่องที่ย้ายไปถังข…')).toBeTruthy();
    expect(
      screen.getByText(
        interpolate(copy['trash.item.active.meta.family'], {
          ชื่อความทรงจำ: 'วันเกิดยาย',
          ชื่อครอบครัว: 'บ้านคุณยาย',
        }),
        { exact: false }
      )
    ).toBeTruthy();
    expect(
      screen.getByText(
        interpolate(copy['trash.item.active.meta.family'], {
          ชื่อความทรงจำ: 'ทริปทะเลกับคุณยาย',
          ชื่อครอบครัว: 'บ้านเรา',
        }),
        { exact: false }
      )
    ).toBeTruthy();
  });
});
