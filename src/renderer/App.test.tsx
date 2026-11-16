import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';
import type { MboardApi } from '../shared/contract';

function stubBridge(): void {
  const api: Partial<MboardApi> = {
    getAppState: async () => ({ kind: 'needsSetup' }),
    onAppState: () => () => undefined,
  };
  Object.defineProperty(window, 'mboard', { value: api, configurable: true });
}

describe('App', () => {
  it('shows the heading and the app state from main', async () => {
    stubBridge();
    render(<App />);
    expect(screen.getByRole('heading', { name: 'mboard' })).toBeTruthy();
    expect(await screen.findByText('needsSetup')).toBeTruthy();
  });
});
