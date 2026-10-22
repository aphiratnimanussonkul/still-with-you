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
    data: { display_name: 'Atta', marketing_consent_at: '2026-01-01T00:00:00.000Z' },
  }),
  isFirstUse: () => false,
}));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/families"
          element={
            <AppShell>
              <p>families-body</p>
            </AppShell>
          }
        />
        <Route
          path="/families/:familyId"
          element={
            <AppShell>
              <p>memories-body</p>
            </AppShell>
          }
        />
        <Route
          path="/memories"
          element={
            <AppShell>
              <p>memories-index</p>
            </AppShell>
          }
        />
        <Route
          path="/trash"
          element={
            <AppShell>
              <p>trash-body</p>
            </AppShell>
          }
        />
        <Route
          path="/settings"
          element={
            <AppShell>
              <p>settings-body</p>
            </AppShell>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

describe('AppShell', () => {
  it('renders icon+label tabs for the four existing nav labels', () => {
    renderAt('/families');
    for (const label of [copy['nav.family'], copy['nav.memories'], copy['nav.trash'], copy['nav.settings']]) {
      expect(screen.getAllByRole('link', { name: label }).length).toBeGreaterThan(0);
    }
    expect(document.querySelector('[data-nav="bottom"]')).toBeTruthy();
    expect(document.querySelector('[data-nav="side"]')).toBeTruthy();
    expect(document.querySelector('[data-nav-region="bottom"]')).toBeTruthy();
  });

  it('keeps logout out of the header', () => {
    renderAt('/families');
    expect(screen.queryByRole('button', { name: copy['logout.action'] })).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('marks ครอบครัว current only on the list, and ความทรงจำ current on a family', () => {
    const { unmount } = renderAt('/families');
    const familyOnList = screen.getAllByRole('link', { name: copy['nav.family'] });
    expect(familyOnList.some((node) => node.getAttribute('aria-current') === 'page')).toBe(true);
    expect(
      screen.getAllByRole('link', { name: copy['nav.memories'] }).every((node) => node.getAttribute('aria-current') !== 'page')
    ).toBe(true);
    unmount();

    renderAt('/families/abc');
    expect(
      screen.getAllByRole('link', { name: copy['nav.memories'] }).some((node) => node.getAttribute('aria-current') === 'page')
    ).toBe(true);
    expect(
      screen.getAllByRole('link', { name: copy['nav.family'] }).every((node) => node.getAttribute('aria-current') !== 'page')
    ).toBe(true);
  });

  it('shows a back control on family memories and not on the root list', () => {
    const { unmount } = renderAt('/families');
    expect(screen.queryByLabelText(copy['a11y.back'])).toBeNull();
    expect(screen.getByRole('heading', { name: copy['family.list.title'] })).toBeTruthy();
    unmount();

    renderAt('/families/abc');
    expect(screen.getByLabelText(copy['a11y.back']).getAttribute('href')).toBe('/families');
    expect(screen.getByRole('heading', { name: copy['memory.list.title'] })).toBeTruthy();
  });

  it('uses existing titles for trash and settings', () => {
    const { unmount } = renderAt('/trash');
    expect(screen.getByRole('heading', { name: copy['trash.title'] })).toBeTruthy();
    unmount();
    renderAt('/settings');
    expect(screen.getByRole('heading', { name: copy['nav.settings'] })).toBeTruthy();
  });
});
