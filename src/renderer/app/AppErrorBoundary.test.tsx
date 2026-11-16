import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppErrorBoundary } from './AppErrorBoundary';

function Exploding(): never {
  throw new Error('window.mboard is missing: the preload script did not run.');
}

describe('AppErrorBoundary', () => {
  afterEach(() => vi.restoreAllMocks());

  it('shows the error and a reload button instead of a blank window', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <AppErrorBoundary>
        <Exploding />
      </AppErrorBoundary>,
    );
    expect(screen.getByRole('heading', { name: 'mboard hit a problem' })).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('preload script did not run');
    expect(screen.getByRole('button', { name: 'Reload' })).toBeTruthy();
  });

  it('renders its children when nothing goes wrong', () => {
    render(
      <AppErrorBoundary>
        <p>Board</p>
      </AppErrorBoundary>,
    );
    expect(screen.getByText('Board')).toBeTruthy();
  });
});
