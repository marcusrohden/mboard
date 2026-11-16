import { describe, expect, expectTypeOf, it } from 'vitest';
import { EVENT_SUBSCRIBERS, IPC } from './contract';
import type { BoardSnapshot, EventChannelMap, InvokeChannelMap, MboardApi, MboardEventApi, Task } from './contract';

describe('IPC channels', () => {
  const channels = [...Object.values(IPC.invoke), ...Object.values(IPC.events)];

  it('are unique across invoke methods and push events', () => {
    expect(new Set(channels).size).toBe(channels.length);
  });

  it('use the area:name form', () => {
    for (const channel of channels) expect(channel).toMatch(/^[a-z]+:[a-zA-Z]+$/);
  });

  it('give every push event a subscriber method', () => {
    expect(Object.keys(EVENT_SUBSCRIBERS).sort()).toEqual(Object.keys(IPC.events).sort());
  });

  it('name each invoke channel after its method', () => {
    for (const [method, channel] of Object.entries(IPC.invoke)) expect(channel.endsWith(`:${method}`)).toBe(true);
  });
});

describe('channel types', () => {
  it('tie invoke channels to argument and result types', () => {
    expectTypeOf<InvokeChannelMap['board:moveTask']['args']>().toEqualTypeOf<[id: string, status: 'To do' | 'In progress' | 'Done', beforeId: string | null]>();
    expectTypeOf<InvokeChannelMap['board:moveTask']['result']>().toEqualTypeOf<Task>();
    expectTypeOf<InvokeChannelMap['board:deleteTask']['result']>().toEqualTypeOf<void>();
    expectTypeOf<InvokeChannelMap['board:getSnapshot']['result']>().toEqualTypeOf<BoardSnapshot>();
  });

  it('tie event channels to payload types', () => {
    expectTypeOf<EventChannelMap['board:snapshot']>().toEqualTypeOf<BoardSnapshot>();
    expectTypeOf<EventChannelMap['app:openTask']>().toEqualTypeOf<string>();
  });

  it('make the bridge the union of invoke and event methods', () => {
    expectTypeOf<MboardApi>().toExtend<MboardEventApi>();
    expectTypeOf<MboardApi['onOpenTask']>().toBeFunction();
  });
});
