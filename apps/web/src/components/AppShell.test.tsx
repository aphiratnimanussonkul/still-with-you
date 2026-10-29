import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AppShell } from '@/components/AppShell';
import { copy } from '@/copy';

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({
    session: { access_token: 'tok' },
    loading: false,
    signInWithGoogle: vi.fn(),
    signOut: vi.fn(),
  }),
}));

vi.mock('@/hooks/use-me', () => ({
  useMe: () => ({
    isPending: false,
    isError: false,
    data: {
      display_name: 'Atta',
      marketing_consent_at: '2026-01-01T00:00:00.000Z',
      consent_answered_at: '2026-01-01T00:00:00.000Z',
    },
  }),
  isFirstUse: () => false,
}));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/home" element={<AppShell><p>home-body</p></AppShell>} />
        <Route path="/memories" element={<AppShell><p>memories-body</p></AppShell>} />
        <Route path="/memories/new" element={<AppShell><p>create-memory</p></AppShell>} />
        <Route path="/memories/:eventId" element={<AppShell><p>memory-detail</p></AppShell>} />
        <Route path="/family" element={<AppShell><p>family-body</p></AppShell>} />
        <Route path="/me" element={<AppShell><p>me-body</p></AppShell>} />
        <Route path="/me/trash" element={<AppShell><p>trash-body</p></AppShell>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('AppShell', () => {
  it('renders the four IA tab labels', () => {
    renderAt('/home');
    for (const label of [copy['nav.home'], copy['nav.memories'], copy['nav.family'], copy['nav.me']]) {
      expect(screen.getAllByRole('link', { name: label }).length).toBeGreaterThan(0);
    }
    expect(document.querySelector('[data-nav="bottom"]')).toBeTruthy();
    expect(document.querySelector('[data-nav="side"]')).toBeTruthy();
  });

  it('keeps logout out of the header', () => {
    renderAt('/home');
    expect(screen.queryByRole('button', { name: copy['logout.action'] })).toBeNull();
  });

  it('marks หน้าแรก current on /home and ความทรงจำ current on /memories', () => {
    const { unmount } = renderAt('/home');
    expect(
      screen.getAllByRole('link', { name: copy['nav.home'] }).some((node) => node.getAttribute('aria-current') === 'page')
    ).toBe(true);
    unmount();

    renderAt('/memories/abc');
    expect(
      screen.getAllByRole('link', { name: copy['nav.memories'] }).some((node) => node.getAttribute('aria-current') === 'page')
    ).toBe(true);
    expect(
      screen.getAllByRole('link', { name: copy['nav.home'] }).every((node) => node.getAttribute('aria-current') !== 'page')
    ).toBe(true);
  });

  it('shows a back control on memory detail and not on the list', () => {
    const { unmount } = renderAt('/memories');
    expect(screen.queryByLabelText(copy['a11y.back'])).toBeNull();
    expect(screen.getByRole('heading', { name: copy['memory.list.title'] })).toBeTruthy();
    expect(document.querySelector('[data-nav-region="bottom"]')).toBeTruthy();
    unmount();

    renderAt('/memories/abc');
    expect(screen.getByLabelText(copy['a11y.back']).getAttribute('href')).toBe('/memories');
    expect(document.querySelector('[data-nav-region="bottom"]')).toBeNull();
  });

  it('hides bottom nav and uses the create title on /memories/new', () => {
    renderAt('/memories/new');
    expect(screen.getByRole('heading', { name: copy['memory.create.title'] })).toBeTruthy();
    expect(screen.getByLabelText(copy['a11y.back']).getAttribute('href')).toBe('/memories');
    expect(document.querySelector('[data-nav-region="bottom"]')).toBeNull();
  });

  it('uses the add-story title and back-to-detail on compose', () => {
    renderAt('/memories/abc?compose=1');
    expect(screen.getByRole('heading', { name: copy['story.add.title'] })).toBeTruthy();
    expect(screen.getByLabelText(copy['a11y.back']).getAttribute('href')).toBe('/memories/abc');
    expect(document.querySelector('[data-nav-region="bottom"]')).toBeNull();
  });

  it('uses ฉัน and trash titles', () => {
    const { unmount } = renderAt('/me');
    expect(screen.getByRole('heading', { name: copy['nav.me'] })).toBeTruthy();
    unmount();
    renderAt('/me/trash');
    expect(screen.getByRole('heading', { name: copy['trash.title'] })).toBeTruthy();
  });
});
