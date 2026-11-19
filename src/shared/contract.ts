import type {
  AgeThresholds,
  AgentSettings,
  LocalDate,
  LocalDateTime,
  NewTaskInput,
  ProjectColour,
  ProjectColours,
  ReminderBannerItem,
  RevertExpectation,
  Status,
  Task,
  TaskEdit,
  TaskId,
} from '../domain';

export type {
  AgeThresholds,
  AgentSettings,
  AgentTerminal,
  HistoryEntry,
  HistoryLedger,
  LedgerChange,
  LedgerCommentsChange,
  LedgerValueChange,
  LocalDate,
  LocalDateTime,
  NewTaskInput,
  ProjectColour,
  ProjectColours,
  ReminderBannerItem,
  RevertExpectation,
  Status,
  Task,
  TaskComment,
  TaskEdit,
  TaskId,
} from '../domain';

/**
 * A file that couldn't be read, with a plain-words reason. It is never written. Usually a task file, a
 * project note in `projects/`, or the board's `projects.md`.
 */
export interface UnreadableFile {
  id: TaskId;
  reason: string;
}

/** A task whose file moved, so its id changed: the id before and the id after. */
export interface TaskIdMove {
  from: TaskId;
  to: TaskId;
}

/**
 * What renaming a project did: the project's name now, which is an existing project's spelling after a
 * merge, how many tasks changed, and the tasks whose id changed because their file moved.
 */
export interface ProjectRename {
  project: string;
  renamed: number;
  moves: TaskIdMove[];
}

/**
 * Everything the renderer needs to draw the board, including each coloured project's colour from its
 * project note, or from `projects.md`. It carries the main process's clock: the renderer never computes "now"
 * or "today" itself.
 */
export interface BoardSnapshot {
  tasks: Task[];
  unreadable: UnreadableFile[];
  projectColours: ProjectColours;
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
 * How far checking for and installing a new version of mboard has got. `installBlocker` says why this copy
 * can't install the new version itself (it can still be downloaded from GitHub), or is `null` when it can.
 * A failure carries the version it was installing, or `null` when the check itself failed.
 */
export type AppUpdateStage =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'upToDate'; checkedAt: LocalDateTime }
  | { kind: 'available'; version: string; installBlocker: string | null }
  | { kind: 'downloading'; version: string; percent: number }
  | { kind: 'installing'; version: string }
  | { kind: 'failed'; message: string; version: string | null };

/** The running version of mboard, and where an app update has got to. */
export interface AppUpdateStatus {
  currentVersion: string;
  stage: AppUpdateStage;
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
  /**
   * Puts a task in `status` above `beforeId`, or at the end with `null`. A `comment` that isn't empty is
   * added by the same update as the move.
   */
  moveTask(id: TaskId, status: Status, beforeId: TaskId | null, comment: string | null): Promise<Task>;
  archiveTask(id: TaskId): Promise<Task>;
  archiveAllDone(): Promise<number>;
  restoreTask(id: TaskId): Promise<Task>;
  revertTask(id: TaskId, toEntryIndex: number, expected: RevertExpectation): Promise<Task>;
  deleteTask(id: TaskId): Promise<void>;
  openInObsidian(id: TaskId): Promise<void>;
  /** Gives a project a colour in its project note, or removes it with `null`. */
  setProjectColour(project: string, colour: ProjectColour | null): Promise<void>;
  /**
   * Renames a project on every task that has it, live and archived, and renames its note. A new name that
   * matches another project ignoring case merges the two. Not an update: each task gains a history entry,
   * but its date updated stays as it was.
   */
  renameProject(from: string, to: string): Promise<ProjectRename>;
  /** Opens a project's note in Obsidian, creating the note first when the project has none. */
  openProjectNote(project: string): Promise<void>;

  getPreferences(): Promise<Preferences>;
  setOpenAtLogin(enabled: boolean): Promise<Preferences>;
  getReminderBanner(): Promise<ReminderBannerItem[]>;
  dismissReminderBanner(): Promise<void>;

  getAgeThresholds(): Promise<AgeThresholds>;
  /** Saves new age-colour thresholds. Rejects thresholds that `ageThresholdsProblem` finds a problem with. */
  setAgeThresholds(thresholds: AgeThresholds): Promise<AgeThresholds>;

  getAgentSettings(): Promise<AgentSettings>;
  /** Saves how **Open agent** starts the agent. Rejects settings that `agentSettingsProblem` finds a problem with. */
  setAgentSettings(settings: AgentSettings): Promise<AgentSettings>;
  /** Opens the agent in the chosen terminal, in the board folder, with the configured prompt and the tasks in Done. */
  openAgent(): Promise<void>;

  getAppUpdateStatus(): Promise<AppUpdateStatus>;
  checkForAppUpdate(): Promise<AppUpdateStatus>;
  /** Downloads and installs the available new version, then restarts mboard. Progress arrives as status pushes. */
  installAppUpdate(): Promise<void>;
  /** Opens the new version's GitHub release page in the browser, or the latest release when none is known. */
  openAppUpdateReleasePage(): Promise<void>;
  /** Whether the app or tray menu asked to open Settings since the last call. Answers `true` once per request. */
  takeOpenSettingsRequest(): Promise<boolean>;
}

/** Each subscription returns a function that unsubscribes. */
export interface MboardEventApi {
  onSnapshot(listener: (snapshot: BoardSnapshot) => void): () => void;
  onAppState(listener: (state: AppState) => void): () => void;
  onOpenTask(listener: (id: TaskId) => void): () => void;
  onReminderBanner(listener: (items: ReminderBannerItem[]) => void): () => void;
  onPreferences(listener: (preferences: Preferences) => void): () => void;
  onAgeThresholds(listener: (thresholds: AgeThresholds) => void): () => void;
  onAgentSettings(listener: (settings: AgentSettings) => void): () => void;
  onAppUpdateStatus(listener: (status: AppUpdateStatus) => void): () => void;
  /** Signals that the menu asked to open Settings; claim the request with `takeOpenSettingsRequest`. */
  onOpenSettings(listener: () => void): () => void;
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
  ageThresholds: AgeThresholds;
  agentSettings: AgentSettings;
  appUpdateStatus: AppUpdateStatus;
  openSettings: void;
}

export type EventName = keyof MboardEventPayloads;

/** The listener-subscribing method for each push event. */
export const EVENT_SUBSCRIBERS = {
  snapshot: 'onSnapshot',
  appState: 'onAppState',
  openTask: 'onOpenTask',
  reminderBanner: 'onReminderBanner',
  preferences: 'onPreferences',
  ageThresholds: 'onAgeThresholds',
  agentSettings: 'onAgentSettings',
  appUpdateStatus: 'onAppUpdateStatus',
  openSettings: 'onOpenSettings',
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
    revertTask: 'board:revertTask',
    deleteTask: 'board:deleteTask',
    openInObsidian: 'board:openInObsidian',
    setProjectColour: 'board:setProjectColour',
    renameProject: 'board:renameProject',
    openProjectNote: 'board:openProjectNote',
    getPreferences: 'platform:getPreferences',
    setOpenAtLogin: 'platform:setOpenAtLogin',
    getReminderBanner: 'platform:getReminderBanner',
    dismissReminderBanner: 'platform:dismissReminderBanner',
    getAgeThresholds: 'settings:getAgeThresholds',
    setAgeThresholds: 'settings:setAgeThresholds',
    getAgentSettings: 'settings:getAgentSettings',
    setAgentSettings: 'settings:setAgentSettings',
    openAgent: 'agent:openAgent',
    getAppUpdateStatus: 'app:getAppUpdateStatus',
    checkForAppUpdate: 'app:checkForAppUpdate',
    installAppUpdate: 'app:installAppUpdate',
    openAppUpdateReleasePage: 'app:openAppUpdateReleasePage',
    takeOpenSettingsRequest: 'app:takeOpenSettingsRequest',
  },
  events: {
    snapshot: 'board:snapshot',
    appState: 'app:state',
    openTask: 'app:openTask',
    reminderBanner: 'platform:reminderBanner',
    preferences: 'platform:preferences',
    ageThresholds: 'settings:ageThresholds',
    agentSettings: 'settings:agentSettings',
    appUpdateStatus: 'app:appUpdateStatus',
    openSettings: 'app:openSettings',
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
