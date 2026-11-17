import { describe, expect, it } from 'vitest';
import { SettingsRequests } from './settings-requests';

function build() {
  const events: string[] = [];
  const requests = new SettingsRequests(
    async () => {
      events.push('show window');
    },
    () => events.push('notify renderer'),
  );
  return { requests, events };
}

describe('SettingsRequests', () => {
  it('shows the window before telling the renderer', async () => {
    const { requests, events } = build();
    await requests.open();
    expect(events).toEqual(['show window', 'notify renderer']);
  });

  it('answers true once per request, so a late subscriber still opens Settings and a reload does not', async () => {
    const { requests } = build();
    expect(requests.take()).toBe(false);
    await requests.open();
    expect(requests.take()).toBe(true);
    expect(requests.take()).toBe(false);
  });

  it('keeps the request pending while the window is still opening', () => {
    const { requests } = build();
    void requests.open();
    expect(requests.take()).toBe(true);
  });
});
