import { DEFAULT_AGE_THRESHOLDS } from '../../../domain';
import type { BoardSnapshot, Task } from '../../../shared/contract';
import type { Clock, NotificationRequest, Notifier, PlatformDependencies, Settings } from '../../ports';
import type {
  FiredKeysStore,
  LoginItemPort,
  PlatformAdapters,
  PowerMonitorPort,
  TimerPort,
  TrayMenuItem,
  TrayPort,
} from '../adapters';

export function localDateTimeToDate(dateTime: string): Date {
  const [datePart = '', timePart = ''] = dateTime.split('T');
  const [year = 0, month = 1, day = 1] = datePart.split('-').map(Number);
  const [hours = 0, minutes = 0, seconds = 0] = timePart.split(':').map(Number);
  return new Date(year, month - 1, day, hours, minutes, seconds);
}

export class FakeClock implements Clock {
  private current: Date;

  constructor(dateTime: string) {
    this.current = localDateTimeToDate(dateTime);
  }

  set(dateTime: string): void {
    this.current = localDateTimeToDate(dateTime);
  }

  now(): Date {
    return new Date(this.current.getTime());
  }
}

export class FakeBoard {
  tasks: Task[] = [];
  private readonly listeners = new Set<(snapshot: BoardSnapshot) => void>();

  snapshot = (): BoardSnapshot => ({ tasks: [...this.tasks], unreadable: [], projectColours: {}, now: '', today: '' });

  onChange = (listener: (snapshot: BoardSnapshot) => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  setTasks(tasks: Task[]): void {
    this.tasks = tasks;
    this.listeners.forEach((listener) => listener(this.snapshot()));
  }

  get listenerCount(): number {
    return this.listeners.size;
  }
}

export class FakeSettings {
  value: Settings;
  readonly updates: Array<Partial<Settings>> = [];

  constructor(initial: Partial<Settings> = {}) {
    this.value = { boardPath: '/vault/board', openAtLogin: true, ageThresholds: DEFAULT_AGE_THRESHOLDS, ...initial };
  }

  read = async (): Promise<Settings> => ({ ...this.value });

  update = async (patch: Partial<Settings>): Promise<Settings> => {
    this.updates.push(patch);
    this.value = { ...this.value, ...patch };
    return { ...this.value };
  };
}

export class FakeNotifier implements Notifier {
  readonly requests: NotificationRequest[] = [];
  result: 'shown' | 'failed' = 'shown';

  notify = async (request: NotificationRequest): Promise<'shown' | 'failed'> => {
    this.requests.push(request);
    return this.result;
  };
}

export class MemoryFiredKeysStore implements FiredKeysStore {
  keys: Set<string>;
  saveCount = 0;

  constructor(initial: Iterable<string> = []) {
    this.keys = new Set(initial);
  }

  load = async (): Promise<Set<string>> => new Set(this.keys);

  save = async (keys: ReadonlySet<string>): Promise<void> => {
    this.saveCount++;
    this.keys = new Set(keys);
  };
}

export class FakeTray implements TrayPort {
  title = '';
  menu: readonly TrayMenuItem[] = [];
  destroyed = false;

  setTitle = (title: string): void => {
    this.title = title;
  };

  setMenu = (items: readonly TrayMenuItem[]): void => {
    this.menu = items;
  };

  destroy = (): void => {
    this.destroyed = true;
  };

  item(label: string): TrayMenuItem {
    const found = this.menu.find((entry) => entry.label === label);
    if (found === undefined) {
      throw new Error(`No tray menu item labelled "${label}"`);
    }
    return found;
  }

  get labels(): string[] {
    return this.menu.flatMap((entry) => (entry.label === undefined ? [] : [entry.label]));
  }
}

export class FakeTimers implements TimerPort {
  private callbacks = new Set<() => void>();
  intervals: number[] = [];

  every = (intervalMs: number, callback: () => void): (() => void) => {
    this.intervals.push(intervalMs);
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  };

  fire(): void {
    [...this.callbacks].forEach((callback) => callback());
  }

  get activeCount(): number {
    return this.callbacks.size;
  }
}

export class FakePowerMonitor implements PowerMonitorPort {
  private listeners = new Set<() => void>();

  onResume = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  resume(): void {
    [...this.listeners].forEach((listener) => listener());
  }

  get listenerCount(): number {
    return this.listeners.size;
  }
}

export class FakeLoginItem implements LoginItemPort {
  readonly calls: boolean[] = [];

  setOpenAtLogin = (enabled: boolean): void => {
    this.calls.push(enabled);
  };
}

export interface PlatformHarness {
  clock: FakeClock;
  board: FakeBoard;
  settings: FakeSettings;
  notifier: FakeNotifier;
  firedKeys: MemoryFiredKeysStore;
  tray: FakeTray;
  timers: FakeTimers;
  powerMonitor: FakePowerMonitor;
  loginItem: FakeLoginItem;
  errors: unknown[];
  adapters: PlatformAdapters;
  dependencies: PlatformDependencies;
  shown: Array<string | undefined>;
  chooseFolderCalls: number;
  openSettingsCalls: number;
  quitCalls: number;
}

/** Builds fakes for every seam of the platform controller, with the clock at `dateTime`. */
export function createHarness(dateTime: string, settings: Partial<Settings> = {}): PlatformHarness {
  const clock = new FakeClock(dateTime);
  const board = new FakeBoard();
  const fakeSettings = new FakeSettings(settings);
  const notifier = new FakeNotifier();
  const firedKeys = new MemoryFiredKeysStore();
  const tray = new FakeTray();
  const timers = new FakeTimers();
  const powerMonitor = new FakePowerMonitor();
  const loginItem = new FakeLoginItem();
  const errors: unknown[] = [];
  const harness = {
    shown: [] as Array<string | undefined>,
    chooseFolderCalls: 0,
    openSettingsCalls: 0,
    quitCalls: 0,
  } as PlatformHarness;
  Object.assign(harness, {
    clock,
    board,
    settings: fakeSettings,
    notifier,
    firedKeys,
    tray,
    timers,
    powerMonitor,
    loginItem,
    errors,
    adapters: {
      createTray: () => tray,
      createNotifier: () => notifier,
      loginItem,
      powerMonitor,
      timers,
      firedKeys,
      reportError: (error: unknown) => errors.push(error),
    },
    dependencies: {
      board: board as unknown as PlatformDependencies['board'],
      settings: fakeSettings,
      clock,
      showWindow: (taskId?: string) => harness.shown.push(taskId),
      chooseFolder: () => {
        harness.chooseFolderCalls++;
      },
      openSettings: () => {
        harness.openSettingsCalls++;
      },
      quit: () => {
        harness.quitCalls++;
      },
    },
  });
  return harness;
}

/** Lets pending promise callbacks run, including chained ones. */
export async function flushPromises(): Promise<void> {
  for (let round = 0; round < 10; round++) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}
