import type {
  AgeThresholds,
  AgentPromptDraft,
  AgentPromptId,
  AgentPromptLibrary,
  AgentSettings,
  AppState,
  AppUpdateStatus,
  BoardSnapshot,
  FolderChoice,
  NewTaskInput,
  Preferences,
  ProjectColour,
  ProjectRename,
  ReminderBannerItem,
  RevertExpectation,
  Status,
  Task,
  TaskEdit,
  TaskId,
} from '../shared/contract';
import type { LaunchConfig } from './launch-config';

/** The single source of "now" in the main process. Tests replace it through `MBOARD_FAKE_NOW`. */
export interface Clock {
  now(): Date;
}

/** Saved position and size of the board window. */
export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The app's own settings, kept in `settings.json` in the user-data folder. Never board data. */
export interface Settings {
  boardPath: string | null;
  openAtLogin: boolean;
  ageThresholds: AgeThresholds;
  agent: AgentSettings;
  windowBounds?: WindowBounds;
}

/** Reads and atomically updates `settings.json`. Missing or invalid settings read as the defaults. */
export interface SettingsStore {
  read(): Promise<Settings>;
  update(patch: Partial<Settings>): Promise<Settings>;
}

/** The age-colour thresholds, kept in `settings.json` and announced to listeners when they change. */
export interface AgeThresholdsSetting {
  get(): AgeThresholds;
  set(next: AgeThresholds): Promise<AgeThresholds>;
  onChange(listener: (thresholds: AgeThresholds) => void): () => void;
}

/** Chooses, checks and reopens the board folder (spec section 4). */
export interface BoardSetupService {
  getAppState(): Promise<AppState>;
  choose(path: string): Promise<FolderChoice>;
  confirm(path: string): Promise<FolderChoice>;
  retry(): Promise<AppState>;
}

/**
 * Owns the open board: loads every task file, watches the folder and applies every in-app change as a
 * read-modify-write of the file on disk (spec sections 2 and 3). With no board open, `snapshot()`
 * returns an empty task list and commands reject.
 */
export interface BoardService {
  open(boardPath: string): Promise<void>;
  close(): Promise<void>;
  snapshot(): BoardSnapshot;
  onChange(listener: (snapshot: BoardSnapshot) => void): () => void;
  rescan(): Promise<void>;
  createTask(input: NewTaskInput): Promise<Task>;
  editTask(id: TaskId, edit: TaskEdit): Promise<Task>;
  addComment(id: TaskId, text: string): Promise<Task>;
  moveTask(id: TaskId, status: Status, beforeId: TaskId | null, comment?: string | null): Promise<Task>;
  archiveTask(id: TaskId): Promise<Task>;
  archiveAllDone(): Promise<number>;
  restoreTask(id: TaskId): Promise<Task>;
  revertTask(id: TaskId, toEntryIndex: number, expected: RevertExpectation): Promise<Task>;
  deleteTask(id: TaskId): Promise<void>;
  setProjectColour(project: string, colour: ProjectColour | null): Promise<void>;
  renameProject(from: string, to: string): Promise<ProjectRename>;
  /** The absolute path of a project's note, created first when the project has none. */
  projectNotePath(project: string): Promise<string>;
  absolutePath(id: TaskId): string;
}

/**
 * The saved agent prompts and every version of each, kept in `agent-prompts.json` in the user-data folder
 * (ADR 0014). Each change resolves with the whole library as saved.
 */
export interface AgentPromptStore {
  /** Reads the library. The first read ever starts it with the prompt `settings.json` used to keep. */
  load(): Promise<AgentPromptLibrary>;
  /**
   * Saves a new prompt as its version 1 and selects it.
   *
   * @throws Error with a user-presentable message when the draft can't be saved.
   */
  create(draft: AgentPromptDraft): Promise<AgentPromptLibrary>;
  /**
   * Saves a draft as the prompt's next version and selects the prompt. A draft that matches the latest version
   * adds nothing.
   *
   * @throws Error with a user-presentable message when the prompt is gone or the draft can't be saved.
   */
  save(id: AgentPromptId, draft: AgentPromptDraft): Promise<AgentPromptLibrary>;
  /**
   * Deletes a prompt with all its versions.
   *
   * @throws Error with a user-presentable message when the prompt is gone or is the last one.
   */
  remove(id: AgentPromptId): Promise<AgentPromptLibrary>;
  /**
   * Makes a prompt the one the Open agent dialog starts on.
   *
   * @throws Error with a user-presentable message when the prompt is gone.
   */
  select(id: AgentPromptId): Promise<AgentPromptLibrary>;
  /**
   * The text of the prompt's latest version.
   *
   * @throws Error with a user-presentable message when the prompt is gone.
   */
  promptText(id: AgentPromptId): Promise<string>;
}

/**
 * Opens the person's AI agent in their terminal, in the board folder, with a saved prompt and the tasks in the
 * agent's columns, and keeps the settings for it in `settings.json` (ADR 0011).
 */
export interface AgentLauncher {
  settings(): Promise<AgentSettings>;
  /**
   * Saves new agent settings and resolves with them as saved.
   *
   * @throws Error with a user-presentable message when `agentSettingsProblem` finds a problem with them.
   */
  saveSettings(next: AgentSettings): Promise<AgentSettings>;
  /** Tells `listener` the settings each time they are saved. Returns a function that stops listening. */
  onSettingsChange(listener: (settings: AgentSettings) => void): () => void;
  /**
   * Opens the agent with the latest version of the saved prompt `promptId`. Resolves once the terminal has been
   * asked to start it.
   *
   * @throws Error with a user-presentable message when no board is open, the prompt is gone, the agent's columns
   * are empty or the terminal can't open.
   */
  open(promptId: AgentPromptId): Promise<void>;
}

/** Moves a deleted task's file somewhere recoverable: the macOS Trash, or a test folder. */
export interface Trash {
  trash(absolutePath: string): Promise<void>;
}

/** A notification to post. A `null` task id opens the board rather than one task. */
export interface NotificationRequest {
  title: string;
  body: string;
  taskId: TaskId | null;
}

/** Posts one notification and reports whether macOS showed it. */
export interface Notifier {
  notify(request: NotificationRequest): Promise<'shown' | 'failed'>;
}

/** What the platform layer needs from the rest of main. */
export interface PlatformDependencies {
  board: BoardService;
  settings: SettingsStore;
  clock: Clock;
  showWindow(taskId?: TaskId): void;
  chooseFolder(): void;
  openSettings(): void;
  quit(): void;
}

/**
 * The menu-bar side of mboard: tray, reminders, notifications and the login item (spec section 6).
 * It reads tasks only through `BoardService.snapshot()` and `onChange`, and never writes task files.
 */
export interface Platform {
  start(dependencies: PlatformDependencies): void;
  stop(): void;
  preferences(): Preferences;
  setOpenAtLogin(enabled: boolean): Promise<Preferences>;
  reminderBanner(): ReminderBannerItem[];
  dismissReminderBanner(): void;
  onBannerChange(listener: (items: ReminderBannerItem[]) => void): () => void;
  onPreferencesChange(listener: (preferences: Preferences) => void): () => void;
}

/** Everything a platform needs to construct itself before `start`. */
export interface PlatformOptions {
  userDataPath: string;
  launchConfig: LaunchConfig;
}

/** Builds the platform layer. Implemented by `src/main/platform`. */
export type PlatformFactory = (options: PlatformOptions) => Platform;

/**
 * Checks GitHub for a new version of mboard and installs it in place (ADR 0004). Failures while checking
 * or installing show in the status rather than rejecting.
 */
export interface AppUpdates {
  status(): AppUpdateStatus;
  onChange(listener: (status: AppUpdateStatus) => void): () => void;
  /** Checks now, showing progress and any failure in the status. */
  check(): Promise<AppUpdateStatus>;
  /**
   * Downloads, checks and installs the available version, then quits so the new one can take over.
   *
   * @throws Error when there is no version this copy can install.
   */
  install(): Promise<void>;
  /** Opens the known release's page in the browser, or the latest release when none is known. */
  openReleasePage(): Promise<void>;
}
