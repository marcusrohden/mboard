import type { FolderChoice, InvokeMethod, MboardInvokeApi } from '../../shared/contract';
import { isFileSystemError } from '../fs/fs-errors';
import type {
  AgeThresholdsSetting,
  AgentLauncher,
  AppUpdates,
  BoardService,
  BoardSetupService,
  Platform,
} from '../ports';
import { userFacingMessage } from '../user-facing-error';
import {
  expectArguments,
  readAgeThresholds,
  readAgentSettings,
  readBoolean,
  readFolderPath,
  readNewTaskInput,
  readEntryIndex,
  readOptionalTaskId,
  readOptionalText,
  readProjectColour,
  readProjectName,
  readRevertExpectation,
  readStatus,
  readTaskEdit,
  readTaskId,
  readText,
} from './argument-validation';

/** The services and native actions the invoke handlers delegate to. */
export interface InvokeHandlerDependencies {
  setup: BoardSetupService;
  board: BoardService;
  platform: Pick<Platform, 'preferences' | 'setOpenAtLogin' | 'reminderBanner' | 'dismissReminderBanner'>;
  ageThresholds: Pick<AgeThresholdsSetting, 'get' | 'set'>;
  agent: AgentLauncher;
  appUpdates: AppUpdates;
  /** Claims a pending request from the menu to open Settings. */
  settingsRequests: { take(): boolean };
  /** Shows the native folder picker and resolves with the chosen folder, or `null` when cancelled. */
  pickBoardFolder(): Promise<string | null>;
  openInObsidian(absolutePath: string): Promise<void>;
}

/** One handler per invoke method. Each takes the raw arguments from the renderer and validates them. */
export type InvokeHandlers = {
  [Method in InvokeMethod]: (...args: unknown[]) => Promise<Awaited<ReturnType<MboardInvokeApi[Method]>>>;
};

const CANCELLED: FolderChoice = { kind: 'cancelled' };

function presentable<Result>(
  handler: (...args: unknown[]) => Promise<Result>,
): (...args: unknown[]) => Promise<Result> {
  return async (...args) => {
    try {
      return await handler(...args);
    } catch (error) {
      if (isFileSystemError(error) || !(error instanceof Error)) console.error('An mboard command failed:', error);
      throw new Error(userFacingMessage(error));
    }
  };
}

function withoutArguments<Result>(run: () => Result | Promise<Result>): (...args: unknown[]) => Promise<Result> {
  return async (...args) => {
    expectArguments(args, 0);
    return run();
  };
}

function boardHandlers(dependencies: InvokeHandlerDependencies) {
  const { board } = dependencies;
  return {
    getSnapshot: withoutArguments(() => board.snapshot()),
    createTask: async (...args: unknown[]) => board.createTask(readNewTaskInput(expectArguments(args, 1)[0])),
    editTask: async (...args: unknown[]) => {
      const [id, edit] = expectArguments(args, 2);
      return board.editTask(readTaskId(id), readTaskEdit(edit));
    },
    addComment: async (...args: unknown[]) => {
      const [id, text] = expectArguments(args, 2);
      return board.addComment(readTaskId(id), readText(text, 'the comment'));
    },
    moveTask: async (...args: unknown[]) => {
      const [id, status, beforeId, comment] = expectArguments(args, 4);
      return board.moveTask(
        readTaskId(id),
        readStatus(status),
        readOptionalTaskId(beforeId),
        readOptionalText(comment, 'the comment'),
      );
    },
    archiveTask: async (...args: unknown[]) => board.archiveTask(readTaskId(expectArguments(args, 1)[0])),
    archiveAllDone: withoutArguments(() => board.archiveAllDone()),
    restoreTask: async (...args: unknown[]) => board.restoreTask(readTaskId(expectArguments(args, 1)[0])),
    revertTask: async (...args: unknown[]) => {
      const [id, toEntryIndex, expected] = expectArguments(args, 3);
      return board.revertTask(readTaskId(id), readEntryIndex(toEntryIndex), readRevertExpectation(expected));
    },
    deleteTask: async (...args: unknown[]) => board.deleteTask(readTaskId(expectArguments(args, 1)[0])),
    setProjectColour: async (...args: unknown[]) => {
      const [project, colour] = expectArguments(args, 2);
      await board.setProjectColour(readProjectName(project), readProjectColour(colour));
    },
    openInObsidian: async (...args: unknown[]) => {
      const absolutePath = board.absolutePath(readTaskId(expectArguments(args, 1)[0]));
      await dependencies.openInObsidian(absolutePath);
    },
  };
}

function setupHandlers({ setup, pickBoardFolder }: InvokeHandlerDependencies) {
  return {
    getAppState: withoutArguments(() => setup.getAppState()),
    chooseBoardFolder: withoutArguments(async () => {
      const folder = await pickBoardFolder();
      return folder === null ? CANCELLED : setup.choose(folder);
    }),
    confirmBoardFolder: async (...args: unknown[]) => setup.confirm(readFolderPath(expectArguments(args, 1)[0])),
    retryOpenBoard: withoutArguments(() => setup.retry()),
  };
}

function platformHandlers({ platform }: InvokeHandlerDependencies) {
  return {
    getPreferences: withoutArguments(() => platform.preferences()),
    setOpenAtLogin: async (...args: unknown[]) =>
      platform.setOpenAtLogin(readBoolean(expectArguments(args, 1)[0], 'open at login')),
    getReminderBanner: withoutArguments(() => platform.reminderBanner()),
    dismissReminderBanner: withoutArguments(() => platform.dismissReminderBanner()),
  };
}

function settingsHandlers({ ageThresholds, agent }: InvokeHandlerDependencies) {
  return {
    getAgeThresholds: withoutArguments(() => ageThresholds.get()),
    setAgeThresholds: async (...args: unknown[]) => ageThresholds.set(readAgeThresholds(expectArguments(args, 1)[0])),
    getAgentSettings: withoutArguments(() => agent.settings()),
    setAgentSettings: async (...args: unknown[]) => agent.saveSettings(readAgentSettings(expectArguments(args, 1)[0])),
  };
}

function agentHandlers({ agent }: InvokeHandlerDependencies) {
  return {
    openAgent: withoutArguments(() => agent.open()),
  };
}

function appHandlers({ appUpdates, settingsRequests }: InvokeHandlerDependencies) {
  return {
    getAppUpdateStatus: withoutArguments(() => appUpdates.status()),
    checkForAppUpdate: withoutArguments(() => appUpdates.check()),
    installAppUpdate: withoutArguments(() => appUpdates.install()),
    openAppUpdateReleasePage: withoutArguments(() => appUpdates.openReleasePage()),
    takeOpenSettingsRequest: withoutArguments(() => settingsRequests.take()),
  };
}

/**
 * Builds a handler for every invoke method in the contract. Every argument from the renderer is checked
 * against the contract's shapes before it reaches a service, and every failure rejects with a
 * user-presentable message.
 */
export function createInvokeHandlers(dependencies: InvokeHandlerDependencies): InvokeHandlers {
  const handlers: InvokeHandlers = {
    ...setupHandlers(dependencies),
    ...boardHandlers(dependencies),
    ...platformHandlers(dependencies),
    ...settingsHandlers(dependencies),
    ...agentHandlers(dependencies),
    ...appHandlers(dependencies),
  };
  return allPresentable(handlers);
}

function allPresentable<Handlers extends Record<string, (...args: unknown[]) => Promise<unknown>>>(
  handlers: Handlers,
): Handlers {
  const entries = Object.entries(handlers).map(([method, handler]) => [method, presentable(handler)]);
  return Object.fromEntries(entries) as Handlers;
}
