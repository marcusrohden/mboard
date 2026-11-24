import { vi, type Mock } from 'vitest';
import {
  DEFAULT_AGE_THRESHOLDS,
  DEFAULT_AGENT_PROMPT,
  DEFAULT_AGENT_SETTINGS,
  addAgentPrompt,
  addAgentPromptVersion,
  changeCommentDate,
  removeAgentPrompt,
  selectAgentPrompt,
  startAgentPromptLibrary,
  ageThresholdsProblem,
  agentSettingsProblem,
  normaliseAgentSettings,
  columnTasks,
  normaliseProject,
  projectFolderName,
  type ProjectColour,
  formatLogTimestamp,
  isSameRevertPoint,
  revertDocument,
  toTask,
  type TaskDocument,
} from '../../domain';
import type {
  AgeThresholds,
  AgentPromptLibrary,
  AgentSettings,
  AppState,
  AppUpdateStage,
  AppUpdateStatus,
  BoardSnapshot,
  MboardApi,
  Preferences,
  ProjectColours,
  ReminderBannerItem,
  Status,
  Task,
  TaskEdit,
  TaskId,
  UnreadableFile,
} from '../../shared/contract';
import { TEST_NOW, TEST_TODAY } from './builders';

type Listeners<T> = Set<(payload: T) => void>;

type MockedApi = { [Method in keyof MboardApi]: Mock<MboardApi[Method]> };

export interface FakeMboardOptions {
  appState?: AppState;
  tasks?: Task[];
  unreadable?: UnreadableFile[];
  banner?: ReminderBannerItem[];
  preferences?: Preferences;
  ageThresholds?: AgeThresholds;
  agentSettings?: AgentSettings;
  /** The saved prompts. One prompt, `Default prompt` with id `default`, unless set. */
  agentPrompts?: AgentPromptLibrary;
  projectColours?: ProjectColours;
  appUpdateStatus?: AppUpdateStatus;
  /** Whether the menu asked to open Settings before the app mounted. */
  pendingSettingsRequest?: boolean;
  now?: string;
  today?: string;
}

export interface FakeMboard {
  api: MockedApi;
  install(): void;
  tasks(): Task[];
  /** The saved prompts as the fake's main process holds them now. */
  agentPrompts(): AgentPromptLibrary;
  setTasks(tasks: Task[]): void;
  setUnreadable(unreadable: UnreadableFile[]): void;
  pushAppState(state: AppState): void;
  pushOpenTask(id: TaskId): void;
  pushBanner(items: ReminderBannerItem[]): void;
  pushPreferences(preferences: Preferences): void;
  pushAgeThresholds(thresholds: AgeThresholds): void;
  pushAppUpdateStage(stage: AppUpdateStage): void;
  /** Does what the app menu's Settings… does: leaves a request pending and pushes `openSettings`. */
  requestSettings(): void;
}

const READY_STATE: AppState = { kind: 'ready', boardPath: '/vault/Board', boardName: 'Board' };

function nameOf(id: TaskId): string {
  return id.slice(id.lastIndexOf('/') + 1).replace(/\.md$/, '');
}

function idFor(folder: 'tasks' | 'archive', project: string | null, name: string): TaskId {
  const projectFolder = projectFolderName(project);
  return projectFolder === null ? `${folder}/${name}.md` : `${folder}/${projectFolder}/${name}.md`;
}

function documentOf(task: Task): TaskDocument {
  const { id: _id, isArchived: _isArchived, ...fields } = task;
  return { ...fields, rawStatus: null, rawProject: null, unknownFrontmatter: [] };
}

function emitAll<T>(listeners: Listeners<T>, payload: T): void {
  listeners.forEach((listener) => listener(payload));
}

function subscribe<T>(listeners: Listeners<T>, listener: (payload: T) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Builds an in-memory stand-in for the main process: a task list that the bridge commands change and
 * push snapshots from, with every method a `vi.fn` so that tests can assert on calls or force a rejection.
 * It models just enough of the real backend to drive the UI: ids follow titles and folders, new and
 * button-moved tasks go to the top, and every update bumps `updated` and adds one history entry.
 * Test-only: never import it from production code.
 */
export function createFakeMboard(options: FakeMboardOptions = {}): FakeMboard {
  let appState = options.appState ?? READY_STATE;
  let tasks = [...(options.tasks ?? [])];
  let unreadable = [...(options.unreadable ?? [])];
  let banner = [...(options.banner ?? [])];
  let preferences = options.preferences ?? { openAtLogin: true, notificationsAvailable: true };
  let ageThresholds = options.ageThresholds ?? { ...DEFAULT_AGE_THRESHOLDS };
  let agentSettings = options.agentSettings ?? { ...DEFAULT_AGENT_SETTINGS };
  let agentPrompts =
    options.agentPrompts ?? startAgentPromptLibrary('default', DEFAULT_AGENT_PROMPT, new Date(options.now ?? TEST_NOW));
  let promptIds = 0;
  let projectColours: Record<string, ProjectColour> = { ...options.projectColours };
  let appUpdateStatus = options.appUpdateStatus ?? { currentVersion: '0.1.0', stage: { kind: 'idle' } };
  let isSettingsRequested = options.pendingSettingsRequest ?? false;
  const now = options.now ?? TEST_NOW;
  const today = options.today ?? TEST_TODAY;

  const snapshotListeners: Listeners<BoardSnapshot> = new Set();
  const appStateListeners: Listeners<AppState> = new Set();
  const openTaskListeners: Listeners<TaskId> = new Set();
  const bannerListeners: Listeners<ReminderBannerItem[]> = new Set();
  const preferencesListeners: Listeners<Preferences> = new Set();
  const ageThresholdsListeners: Listeners<AgeThresholds> = new Set();
  const agentSettingsListeners: Listeners<AgentSettings> = new Set();
  const appUpdateListeners: Listeners<AppUpdateStatus> = new Set();
  const openSettingsListeners: Listeners<void> = new Set();

  const snapshot = (): BoardSnapshot => ({
    tasks: structuredClone(tasks),
    unreadable: [...unreadable],
    projectColours: { ...projectColours },
    now,
    today,
  });
  const publish = (): void => emitAll(snapshotListeners, snapshot());
  const logStamp = formatLogTimestamp(new Date(now));

  function setAppUpdateStage(stage: AppUpdateStage): AppUpdateStatus {
    appUpdateStatus = { ...appUpdateStatus, stage };
    emitAll(appUpdateListeners, appUpdateStatus);
    return appUpdateStatus;
  }

  function find(id: TaskId): Task {
    const task = tasks.find((candidate) => candidate.id === id);
    if (task === undefined) throw new Error('That task no longer exists.');
    return task;
  }

  function replace(id: TaskId, next: Task): Task {
    tasks = tasks.map((task) => (task.id === id ? next : task));
    publish();
    return structuredClone(next);
  }

  function recorded(task: Task, text: string, changes: Partial<Task>): Task {
    return { ...task, ...changes, updated: now, history: [...task.history, { at: logStamp, text }] };
  }

  function recordedQuietly(task: Task, text: string, changes: Partial<Task>): Task {
    return { ...task, ...changes, history: [...task.history, { at: logStamp, text }] };
  }

  function folderOf(task: Task): 'tasks' | 'archive' {
    return task.isArchived ? 'archive' : 'tasks';
  }

  function changeProject(task: Task, value: string | null): Task {
    const project = normaliseProject(value);
    if (project === task.project) return task;
    return recordedQuietly(task, `Project changed from ${task.project ?? '(none)'} to ${project ?? '(none)'}`, {
      project,
      id: idFor(folderOf(task), project, nameOf(task.id)),
    });
  }

  function colourOf(project: string): ProjectColour | null {
    const wanted = project.toLowerCase();
    return Object.entries(projectColours).find(([name]) => name.toLowerCase() === wanted)?.[1] ?? null;
  }

  function withColour(project: string, colour: ProjectColour | null): void {
    const wanted = project.toLowerCase();
    const others = Object.entries(projectColours).filter(([existing]) => existing.toLowerCase() !== wanted);
    projectColours = Object.fromEntries(colour === null ? others : [...others, [project, colour]]);
  }

  function topOrder(status: Status, excluding: TaskId | null): number {
    const orders = columnTasks(tasks, status)
      .filter((task) => task.id !== excluding)
      .flatMap((task) => (task.order === null ? [] : [task.order]));
    return orders.length === 0 ? 1 : Math.min(...orders) - 1;
  }

  function applyEdit(task: Task, edit: TaskEdit): Task {
    if (task.isArchived && edit.field === 'project') return changeProject(task, edit.value);
    if (task.isArchived) throw new Error("An archived task's project is all that can change.");
    switch (edit.field) {
      case 'title': {
        const title = edit.value.trim();
        if (title === '') throw new Error('A task needs a title.');
        if (title === task.title) return task;
        return recorded(task, `Title changed from "${task.title}" to "${title}"`, {
          title,
          id: idFor('tasks', task.project, title),
        });
      }
      case 'description':
        return edit.value === task.description
          ? task
          : recorded(task, 'Description edited', { description: edit.value });
      case 'project': {
        const project = edit.value === null || edit.value.trim() === '' ? null : edit.value.trim();
        if (project === task.project) return task;
        return recorded(task, `Project changed from ${task.project ?? '(none)'} to ${project ?? '(none)'}`, {
          project,
          id: idFor('tasks', project, nameOf(task.id)),
        });
      }
      case 'due':
        if (edit.value === task.due) return task;
        return recorded(task, `Due date changed from ${task.due ?? '(none)'} to ${edit.value ?? '(none)'}`, {
          due: edit.value,
        });
    }
  }

  function renumberColumn(orderedIds: TaskId[]): void {
    tasks = tasks.map((task) => {
      const position = orderedIds.indexOf(task.id);
      return position === -1 ? task : { ...task, order: position + 1 };
    });
  }

  const api: MockedApi = {
    getAppState: vi.fn(async () => appState),
    chooseBoardFolder: vi.fn(async () => ({ kind: 'cancelled' as const })),
    confirmBoardFolder: vi.fn(async () => ({ kind: 'cancelled' as const })),
    retryOpenBoard: vi.fn(async () => appState),

    getSnapshot: vi.fn(async () => snapshot()),
    createTask: vi.fn(async (input) => {
      const title = input.title.trim();
      const created: Task = {
        id: idFor('tasks', input.project, title),
        title,
        status: input.status,
        project: input.project,
        due: input.due,
        created: now,
        updated: now,
        archivedAt: null,
        isArchived: false,
        order: topOrder(input.status, null),
        description: input.description,
        comments: [],
        history: [{ at: logStamp, text: `Created in ${input.status}` }],
      };
      tasks = [...tasks, created];
      publish();
      return structuredClone(created);
    }),
    editTask: vi.fn(async (id, edit) => replace(id, applyEdit(find(id), edit))),
    addComment: vi.fn(async (id, text) => {
      const task = find(id);
      const comment = { at: logStamp, text: text.trim() };
      return replace(id, recorded(task, 'Comment added', { comments: [...task.comments, comment] }));
    }),
    changeCommentDate: vi.fn(async (id, comment, at) => {
      const task = find(id);
      if (task.isArchived) throw new Error("Archived tasks can't be changed. Restore the task first.");
      const result = changeCommentDate(documentOf(task), comment, at, new Date(now));
      return result.changed ? replace(id, toTask(result.document, id, false)) : structuredClone(task);
    }),
    moveTask: vi.fn(async (id, status, beforeId, comment) => {
      const task = find(id);
      const moveComments =
        comment === null || comment.trim() === ''
          ? task.comments
          : [...task.comments, { at: logStamp, text: comment.trim() }];
      const targetIds = columnTasks(tasks, status)
        .map((candidate) => candidate.id)
        .filter((candidateId) => candidateId !== id);
      const insertAt = beforeId === null ? targetIds.length : targetIds.indexOf(beforeId);
      if (insertAt === -1) throw new Error("That task isn't in the column any more.");
      targetIds.splice(insertAt, 0, id);
      const moved =
        status === task.status
          ? task
          : recorded(task, `Moved from ${task.status} to ${status}`, { status, comments: moveComments });
      tasks = tasks.map((candidate) => (candidate.id === id ? moved : candidate));
      renumberColumn(targetIds);
      publish();
      return structuredClone(find(id));
    }),
    archiveTask: vi.fn(async (id) => {
      const task = find(id);
      if (task.status !== 'Done') throw new Error('Only tasks in Done can be archived.');
      const archived = recorded(task, 'Archived', {
        id: idFor('archive', task.project, nameOf(id)),
        isArchived: true,
        archivedAt: now,
        order: null,
      });
      return replace(id, archived);
    }),
    archiveAllDone: vi.fn(async () => {
      const done = columnTasks(tasks, 'Done');
      tasks = tasks.map((task) =>
        done.some((candidate) => candidate.id === task.id)
          ? recorded(task, 'Archived', {
              id: `archive/${nameOf(task.id)}.md`,
              isArchived: true,
              archivedAt: now,
              order: null,
            })
          : task,
      );
      publish();
      return done.length;
    }),
    restoreTask: vi.fn(async (id) => {
      const task = find(id);
      const restored = recorded(task, 'Restored to Done', {
        id: idFor('tasks', task.project, nameOf(id)),
        isArchived: false,
        archivedAt: null,
        status: 'Done',
        order: topOrder('Done', null),
      });
      return replace(id, restored);
    }),
    revertTask: vi.fn(async (id, toEntryIndex, expected) => {
      const task = find(id);
      if (task.isArchived) throw new Error("Archived tasks can't be changed. Restore the task first.");
      if (!isSameRevertPoint(task.history, toEntryIndex, expected)) {
        throw new Error('This task changed since you opened its history. Check it and try again.');
      }
      const reverted = revertDocument(documentOf(task), toEntryIndex, new Date(now));
      const order = reverted.status === task.status ? task.order : topOrder(reverted.status, id);
      return replace(id, toTask({ ...reverted, order }, idFor('tasks', reverted.project, reverted.title), false));
    }),
    deleteTask: vi.fn(async (id) => {
      find(id);
      tasks = tasks.filter((task) => task.id !== id);
      publish();
    }),
    openInObsidian: vi.fn(async () => undefined),
    setProjectColour: vi.fn(async (project, colour) => {
      const name = normaliseProject(project);
      if (name === null) throw new Error('Choose a project before giving it a colour.');
      withColour(name, colour);
      publish();
    }),
    renameProject: vi.fn(async (from, to) => {
      const source = normaliseProject(from);
      const name = normaliseProject(to);
      if (source === null || name === null) throw new Error('Give the project a name.');
      const others = tasks.flatMap((task) =>
        task.project !== null && task.project.toLowerCase() !== source.toLowerCase() ? [task.project] : [],
      );
      const target = others.find((project) => project.toLowerCase() === name.toLowerCase()) ?? name;
      const colour = colourOf(target) ?? colourOf(source);
      const moves: Array<{ from: TaskId; to: TaskId }> = [];
      let renamed = 0;
      tasks = tasks.map((task) => {
        if (task.project === null || task.project.toLowerCase() !== source.toLowerCase()) return task;
        const next = recordedQuietly(task, `Project renamed from ${task.project} to ${target}`, {
          project: target,
          id: idFor(folderOf(task), target, nameOf(task.id)),
        });
        renamed += 1;
        if (next.id !== task.id) moves.push({ from: task.id, to: next.id });
        return next;
      });
      withColour(source, null);
      withColour(target, colour);
      publish();
      return { project: target, renamed, moves };
    }),
    openProjectNote: vi.fn(async () => undefined),

    getPreferences: vi.fn(async () => preferences),
    setOpenAtLogin: vi.fn(async (enabled) => {
      preferences = { ...preferences, openAtLogin: enabled };
      emitAll(preferencesListeners, preferences);
      return preferences;
    }),
    getAgeThresholds: vi.fn(async () => ageThresholds),
    setAgeThresholds: vi.fn(async (next) => {
      const problem = ageThresholdsProblem(next);
      if (problem !== null) throw new Error(problem);
      ageThresholds = { ...next };
      emitAll(ageThresholdsListeners, ageThresholds);
      return ageThresholds;
    }),
    getAgentSettings: vi.fn(async () => ({ ...agentSettings })),
    setAgentSettings: vi.fn(async (next) => {
      const problem = agentSettingsProblem(next);
      if (problem !== null) throw new Error(problem);
      agentSettings = normaliseAgentSettings(next);
      emitAll(agentSettingsListeners, { ...agentSettings });
      return { ...agentSettings };
    }),
    openAgent: vi.fn(async () => undefined),
    getAgentPrompts: vi.fn(async () => structuredClone(agentPrompts)),
    createAgentPrompt: vi.fn(async (draft) => {
      promptIds += 1;
      agentPrompts = addAgentPrompt(agentPrompts, `prompt-${promptIds}`, draft, new Date(now));
      return structuredClone(agentPrompts);
    }),
    saveAgentPrompt: vi.fn(async (id, draft) => {
      agentPrompts = addAgentPromptVersion(agentPrompts, id, draft, new Date(now));
      return structuredClone(agentPrompts);
    }),
    deleteAgentPrompt: vi.fn(async (id) => {
      agentPrompts = removeAgentPrompt(agentPrompts, id);
      return structuredClone(agentPrompts);
    }),
    selectAgentPrompt: vi.fn(async (id) => {
      agentPrompts = selectAgentPrompt(agentPrompts, id);
      return structuredClone(agentPrompts);
    }),
    getReminderBanner: vi.fn(async () => banner),
    dismissReminderBanner: vi.fn(async () => {
      banner = [];
      emitAll(bannerListeners, banner);
    }),

    getAppUpdateStatus: vi.fn(async () => appUpdateStatus),
    checkForAppUpdate: vi.fn(async () => setAppUpdateStage({ kind: 'upToDate', checkedAt: now })),
    installAppUpdate: vi.fn(async () => {
      const { stage } = appUpdateStatus;
      if (stage.kind !== 'available') throw new Error("There's no new version to install. Check for updates first.");
      setAppUpdateStage({ kind: 'downloading', version: stage.version, percent: 0 });
    }),
    openAppUpdateReleasePage: vi.fn(async () => undefined),
    takeOpenSettingsRequest: vi.fn(async () => {
      const wasRequested = isSettingsRequested;
      isSettingsRequested = false;
      return wasRequested;
    }),

    onSnapshot: vi.fn((listener) => subscribe(snapshotListeners, listener)),
    onAppState: vi.fn((listener) => subscribe(appStateListeners, listener)),
    onOpenTask: vi.fn((listener) => subscribe(openTaskListeners, listener)),
    onReminderBanner: vi.fn((listener) => subscribe(bannerListeners, listener)),
    onPreferences: vi.fn((listener) => subscribe(preferencesListeners, listener)),
    onAgeThresholds: vi.fn((listener) => subscribe(ageThresholdsListeners, listener)),
    onAgentSettings: vi.fn((listener) => subscribe(agentSettingsListeners, listener)),
    onAppUpdateStatus: vi.fn((listener) => subscribe(appUpdateListeners, listener)),
    onOpenSettings: vi.fn((listener) => subscribe(openSettingsListeners, listener)),
  };

  return {
    api,
    install() {
      Object.defineProperty(window, 'mboard', { value: api, configurable: true, writable: true });
    },
    tasks: () => structuredClone(tasks),
    agentPrompts: () => structuredClone(agentPrompts),
    setTasks(next) {
      tasks = [...next];
      publish();
    },
    setUnreadable(next) {
      unreadable = [...next];
      publish();
    },
    pushAppState(state) {
      appState = state;
      emitAll(appStateListeners, state);
    },
    pushOpenTask: (id) => emitAll(openTaskListeners, id),
    pushBanner(items) {
      banner = [...items];
      emitAll(bannerListeners, banner);
    },
    pushPreferences(next) {
      preferences = next;
      emitAll(preferencesListeners, preferences);
    },
    pushAgeThresholds(next) {
      ageThresholds = { ...next };
      emitAll(ageThresholdsListeners, ageThresholds);
    },
    pushAppUpdateStage: (stage) => void setAppUpdateStage(stage),
    requestSettings() {
      isSettingsRequested = true;
      emitAll(openSettingsListeners, undefined);
    },
  };
}
