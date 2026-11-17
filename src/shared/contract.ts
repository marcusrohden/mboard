import type {
  LocalDate,
  LocalDateTime,
  NewTaskInput,
  ReminderBannerItem,
  Status,
  Task,
  TaskEdit,
  TaskId,
} from '../domain';

export type {
  HistoryEntry,
  LocalDate,
  LocalDateTime,
  NewTaskInput,
  ReminderBannerItem,
  Status,
  Task,
  TaskComment,
  TaskEdit,
  TaskId,
} from '../domain';

/** A task file that couldn't be read as a task, with a plain-words reason. It is never written. */
export interface UnreadableFile {
  id: TaskId;
  reason: string;
}

/**
 * Everything the renderer needs to draw the board. It carries the main process's clock: the renderer
 * never computes "now" or "today" itself.
 */
export interface BoardSnapshot {
  tasks: Task[];
  unreadable: UnreadableFile[];
  now: LocalDateTime;
  today: LocalDate;
}

export type UnavailableReason = 'notFound' | 'permissionDenied' | 'notADirectory';

export type AppState =
  | { kind: 'needsSetup' }
  | { kind: 'unavailable'; path: string; reason: UnavailableReason }
  | { kind: 'ready'; boardPath: string; boardName: string };

export type FolderChoice =
  | { kind: 'cancelled' }
  | { kind: 'rejected'; path: string; message: string }
  | { kind: 'needsConfirmation'; path: string; message: string }
  | { kind: 'accepted'; state: AppState };

export interface Preferences {
  openAtLogin: boolean;
  notificationsAvailable: boolean | null;
}

/**
 * The commands the renderer can invoke. A rejected command (an unknown id, a missing file, an edit to an
 * archived task, invalid input) throws an `Error` whose message is user-presentable.
 */
export interface MboardInvokeApi {
  getAppState(): Promise<AppState>;
  chooseBoardFolder(): Promise<FolderChoice>;
  confirmBoardFolder(path: string): Promise<FolderChoice>;
  retryOpenBoard(): Promise<AppState>;

  getSnapshot(): Promise<BoardSnapshot>;
  createTask(input: NewTaskInput): Promise<Task>;
  editTask(id: TaskId, edit: TaskEdit): Promise<Task>;
  addComment(id: TaskId, text: string): Promise<Task>;
  moveTask(id: TaskId, status: Status, beforeId: TaskId | null): Promise<Task>;
  archiveTask(id: TaskId): Promise<Task>;
  archiveAllDone(): Promise<number>;
  restoreTask(id: TaskId): Promise<Task>;
  deleteTask(id: TaskId): Promise<void>;
  openInObsidian(id: TaskId): Promise<void>;

  getPreferences(): Promise<Preferences>;
  setOpenAtLogin(enabled: boolean): Promise<Preferences>;
  getReminderBanner(): Promise<ReminderBannerItem[]>;
  dismissReminderBanner(): Promise<void>;
}

/** Each subscription returns a function that unsubscribes. */
export interface MboardEventApi {
  onSnapshot(listener: (snapshot: BoardSnapshot) => void): () => void;
  onAppState(listener: (state: AppState) => void): () => void;
  onOpenTask(listener: (id: TaskId) => void): () => void;
  onReminderBanner(listener: (items: ReminderBannerItem[]) => void): () => void;
  onPreferences(listener: (preferences: Preferences) => void): () => void;
}

/** The whole bridge, exposed to the renderer as `window.mboard`. */
export interface MboardApi extends MboardInvokeApi, MboardEventApi {}

export type InvokeMethod = keyof MboardInvokeApi;

/** The payload each push event carries. `snapshot` is delivered to `onSnapshot` listeners, and so on. */
export interface MboardEventPayloads {
  snapshot: BoardSnapshot;
  appState: AppState;
  openTask: TaskId;
  reminderBanner: ReminderBannerItem[];
  preferences: Preferences;
}

export type EventName = keyof MboardEventPayloads;

/** The listener-subscribing method for each push event. */
export const EVENT_SUBSCRIBERS = {
  snapshot: 'onSnapshot',
  appState: 'onAppState',
  openTask: 'onOpenTask',
  reminderBanner: 'onReminderBanner',
  preferences: 'onPreferences',
} as const satisfies Record<EventName, keyof MboardEventApi>;

/**
 * IPC channel names. `invoke` maps every `MboardInvokeApi` method to the channel main handles with
 * `ipcMain.handle`. `events` maps every push event to the channel main sends on with `webContents.send`.
 */
export const IPC = {
  invoke: {
    getAppState: 'app:getAppState',
    chooseBoardFolder: 'app:chooseBoardFolder',
    confirmBoardFolder: 'app:confirmBoardFolder',
    retryOpenBoard: 'app:retryOpenBoard',
    getSnapshot: 'board:getSnapshot',
    createTask: 'board:createTask',
    editTask: 'board:editTask',
    addComment: 'board:addComment',
    moveTask: 'board:moveTask',
    archiveTask: 'board:archiveTask',
    archiveAllDone: 'board:archiveAllDone',
    restoreTask: 'board:restoreTask',
    deleteTask: 'board:deleteTask',
    openInObsidian: 'board:openInObsidian',
    getPreferences: 'platform:getPreferences',
    setOpenAtLogin: 'platform:setOpenAtLogin',
    getReminderBanner: 'platform:getReminderBanner',
    dismissReminderBanner: 'platform:dismissReminderBanner',
  },
  events: {
    snapshot: 'board:snapshot',
    appState: 'app:state',
    openTask: 'app:openTask',
    reminderBanner: 'platform:reminderBanner',
    preferences: 'platform:preferences',
  },
} as const satisfies {
  invoke: Record<InvokeMethod, string>;
  events: Record<EventName, string>;
};

export type InvokeChannel = (typeof IPC.invoke)[InvokeMethod];
export type EventChannel = (typeof IPC.events)[EventName];

/** For each invoke channel, the argument list and the resolved result of its method. */
export type InvokeChannelMap = {
  [Method in InvokeMethod as (typeof IPC.invoke)[Method]]: {
    args: Parameters<MboardInvokeApi[Method]>;
    result: Awaited<ReturnType<MboardInvokeApi[Method]>>;
  };
};

/** For each push event channel, the payload main sends. */
export type EventChannelMap = {
  [Event in EventName as (typeof IPC.events)[Event]]: MboardEventPayloads[Event];
};
