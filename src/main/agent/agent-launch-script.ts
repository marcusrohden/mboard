import { AGENT_PROMPT_PLACEHOLDER } from '../../domain';

/** The variable that carries the prompt from the launch script into the person's shell. */
export const AGENT_PROMPT_VARIABLE = 'MBOARD_AGENT_PROMPT';

/** What a launch script needs: every path is absolute. */
export interface AgentLaunch {
  /** The person's login shell, which knows their aliases, functions and PATH. */
  shell: string;
  /** Where the agent starts: the board folder. */
  workingDirectory: string;
  /** The file holding the prompt. It is read once, before the launch folder is removed. */
  promptFile: string;
  /** The temporary folder holding the prompt and the script, removed once the prompt has been read. */
  launchFolder: string;
  /** The agent command from Settings, as the person typed it. */
  command: string;
}

/** Quotes `text` as a single word for a POSIX shell, so that nothing in it is expanded. */
export function shellQuote(text: string): string {
  return `'${text.replaceAll("'", `'\\''`)}'`;
}

/**
 * The person's agent command with the prompt passed to it: in place of every `{prompt}` when the command
 * has one, otherwise as its last argument. The prompt is always a single, double-quoted variable, so its
 * text is never parsed by the shell.
 */
export function agentCommandLine(command: string): string {
  const prompt = `"$${AGENT_PROMPT_VARIABLE}"`;
  return command.includes(AGENT_PROMPT_PLACEHOLDER)
    ? command.replaceAll(AGENT_PROMPT_PLACEHOLDER, prompt)
    : `${command} ${prompt}`;
}

/**
 * The `/bin/sh` script a terminal runs to start the agent (ADR 0011). It moves to the board folder, reads
 * the prompt into a variable, removes the temporary files, then hands over to the person's interactive
 * login shell, so their aliases and PATH apply to the command. When the agent exits, the window carries on
 * as an ordinary shell in the board folder, without the prompt variable.
 */
export function agentLaunchScript(launch: AgentLaunch): string {
  const shell = shellQuote(launch.shell);
  const session = `${agentCommandLine(launch.command)}; exec env -u ${AGENT_PROMPT_VARIABLE} ${shell} -il`;
  return [
    '#!/bin/sh',
    `cd ${shellQuote(launch.workingDirectory)} || exit 1`,
    `${AGENT_PROMPT_VARIABLE}=$(cat ${shellQuote(launch.promptFile)}) || exit 1`,
    `export ${AGENT_PROMPT_VARIABLE}`,
    `rm -rf ${shellQuote(launch.launchFolder)}`,
    `exec ${shell} -ilc ${shellQuote(session)}`,
    '',
  ].join('\n');
}
