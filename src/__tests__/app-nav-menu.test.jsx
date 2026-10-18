import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { vi } from 'vitest';
import { NavMenu } from '@/app/ModuleLayout';

// the PWA helpers import a Vite virtual module that only exists in the app build
vi.mock('@/app/pwa', () => ({ OfflineBanner: () => null }));

/** Sidebar / drawer menu: every module is a dropdown; the current module opens by itself; choices are remembered. */
const renderAt = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <NavMenu />
    </MemoryRouter>,
  );

beforeEach(() => window.localStorage.clear());

describe('NavMenu dropdown groups', () => {
  test('the group of the current page is open, the others are closed', () => {
    renderAt('/sales/history');
    expect(screen.getByRole('button', { name: 'Sales' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: 'Sales History' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Purchase' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('link', { name: 'Purchase Bill' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeVisible();
  });

  test('a group opens and closes on click, and the choice is remembered', () => {
    const { unmount } = renderAt('/');
    const purchase = screen.getByRole('button', { name: 'Purchase' });
    fireEvent.click(purchase);
    expect(purchase).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: 'Purchase Bill' })).toBeVisible();
    unmount();

    renderAt('/');
    expect(screen.getByRole('button', { name: 'Purchase' })).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Purchase' }));
    expect(screen.queryByRole('link', { name: 'Purchase Bill' })).toBeNull();
  });
});
