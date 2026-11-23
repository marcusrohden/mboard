import { chmod, mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  agentSettingsProblem,
  composeAgentPrompt,
  describeColumns,
  normaliseAgentSettings,
  tasksForAgent,
  type AgentPromptId,
  type AgentSettings,
  type Status,
} from '../../domain';
import type { AgentLauncher, AgentPromptStore, BoardService, Clock, SettingsStore } from '../ports';
import { agentLaunchScript } from './agent-launch-script';
import type { OpenInTerminal } from './terminal-opener';

/** What the launcher needs from the rest of main. */
export interface AgentLauncherOptions {
  settings: SettingsStore;
  prompts: Pick<AgentPromptStore, 'promptText'>;
  board: Pick<BoardService, 'snapshot'>;
  /** The open board's folder, or `null` when no board is open. */
  boardPath(): Promise<string | null>;
  /** The person's login shell, as an absolute path. */
  shell: string;
  /** Where launch folders are made: the system's temporary folder, or a test folder. */
  temporaryFolder: string;
  openInTerminal: OpenInTerminal;
  clock: Clock;
}

export const AgentMessage = {
  noBoard: 'Open a board first, so the agent has tasks to work with.',
  nothingInColumns: (columns: readonly Status[]) =>
    `There are no tasks in ${describeColumns(columns)} to give the agent.`,
  tooLong: "The agent's tasks are too long to hand over in one go. Archive some of them, or choose fewer columns.",
  notPrepared: "mboard couldn't write the agent's prompt to a temporary folder.",
} as const;

export const LAUNCH_FOLDER_PREFIX = 'mboard-agent-';
export const PROMPT_FILE_NAME = 'prompt.md';
export const SCRIPT_FILE_NAME = 'open-agent.command';
/** Well inside macOS's limit on the arguments one command can take, which the prompt is passed as. */
export const MAX_PROMPT_BYTES = 256 * 1024;
/** How old a launch folder must be before it counts as left behind by a terminal that never ran it. */
export const STALE_LAUNCH_FOLDER_MS = 60 * 60 * 1000;

const OWNER_ONLY_FILE = 0o600;
const OWNER_ONLY_SCRIPT = 0o700;

/**
 * Starts the agent through a terminal (ADR 0011), with a saved prompt (ADR 0014) and the live tasks in the
 * agent's columns. For each launch it writes the composed prompt and a `.command` script into a fresh, private
 * temporary folder and opens the script in the chosen terminal. The script removes the folder once it has read
 * the prompt; a folder left behind because the terminal never ran it is removed by a later launch. Settings and
 * the prompt are read from disk at every launch, so a change applies straight away.
 */
export class TerminalAgentLauncher implements AgentLauncher {
  private readonly listeners = new Set<(settings: AgentSettings) => void>();

  constructor(private readonly options: AgentLauncherOptions) {}

  async settings(): Promise<AgentSettings> {
    return (await this.options.settings.read()).agent;
  }

  async saveSettings(next: AgentSettings): Promise<AgentSettings> {
    const problem = agentSettingsProblem(next);
    if (problem !== null) throw new Error(problem);
    const saved = (await this.options.settings.update({ agent: normaliseAgentSettings(next) })).agent;
    this.listeners.forEach((listener) => listener(saved));
    return saved;
  }

  onSettingsChange(listener: (settings: AgentSettings) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async open(promptId: AgentPromptId): Promise<void> {
    const boardPath = await this.options.boardPath();
    if (boardPath === null) throw new Error(AgentMessage.noBoard);
    const { agent } = await this.options.settings.read();
    const tasks = tasksForAgent(this.options.board.snapshot().tasks, agent.columns);
    if (tasks.length === 0) throw new Error(AgentMessage.nothingInColumns(agent.columns));
    const ownPrompt = await this.options.prompts.promptText(promptId);
    const prompt = composeAgentPrompt(ownPrompt, tasks, agent.columns);
    if (Buffer.byteLength(prompt, 'utf8') > MAX_PROMPT_BYTES) throw new Error(AgentMessage.tooLong);

    await this.removeStaleLaunchFolders();
    const launch = await this.prepareLaunch(boardPath, agent.command, prompt);
    try {
      await this.options.openInTerminal(agent.terminal, launch.scriptPath);
    } catch (error) {
      await rm(launch.folder, { recursive: true, force: true });
      throw error;
    }
  }

  private async prepareLaunch(
    boardPath: string,
    command: string,
    prompt: string,
  ): Promise<{ folder: string; scriptPath: string }> {
    let folder: string | null = null;
    try {
      folder = await mkdtemp(path.join(this.options.temporaryFolder, LAUNCH_FOLDER_PREFIX));
      const promptFile = path.join(folder, PROMPT_FILE_NAME);
      const scriptPath = path.join(folder, SCRIPT_FILE_NAME);
      await writeFile(promptFile, prompt, { mode: OWNER_ONLY_FILE });
      const script = agentLaunchScript({
        shell: this.options.shell,
        workingDirectory: boardPath,
        promptFile,
        launchFolder: folder,
        command,
      });
      await writeFile(scriptPath, script, { mode: OWNER_ONLY_SCRIPT });
      await chmod(scriptPath, OWNER_ONLY_SCRIPT);
      return { folder, scriptPath };
    } catch (error) {
      console.error('mboard could not prepare the agent launch:', error);
      if (folder !== null) await rm(folder, { recursive: true, force: true });
      throw new Error(AgentMessage.notPrepared);
    }
  }

  private async removeStaleLaunchFolders(): Promise<void> {
    const cutoff = this.options.clock.now().getTime() - STALE_LAUNCH_FOLDER_MS;
    try {
      const names = await readdir(this.options.temporaryFolder);
      for (const name of names.filter((candidate) => candidate.startsWith(LAUNCH_FOLDER_PREFIX))) {
        const folder = path.join(this.options.temporaryFolder, name);
        if ((await stat(folder)).mtimeMs < cutoff) await rm(folder, { recursive: true, force: true });
      }
    } catch (error) {
      console.error('mboard could not tidy up earlier agent launches:', error);
    }
  }
}
