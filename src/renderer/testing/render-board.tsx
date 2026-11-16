import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App';
import { createFakeMboard, type FakeMboard, type FakeMboardOptions } from './fake-mboard';

export interface RenderedBoard {
  fake: FakeMboard;
  user: ReturnType<typeof userEvent.setup>;
}

/**
 * Installs a fake bridge, renders the whole app and waits for the board's header. Test-only.
 */
export async function renderBoard(options: FakeMboardOptions = {}): Promise<RenderedBoard> {
  const fake = createFakeMboard(options);
  fake.install();
  const user = userEvent.setup();
  render(<App />);
  await screen.findByRole('searchbox', { name: 'Search tasks' });
  return { fake, user };
}
