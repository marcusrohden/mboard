import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTemporaryFolder, removeTemporaryFolder } from '../test-support/temporary-folder';
import { agentCommandLine, agentLaunchScript, shellQuote } from './agent-launch-script';

/**
 * Runs a script with `/bin/sh` and no input, so the interactive shell it ends in logs out straight away.
 * That logout's exit status is not the script's outcome, so only a failure to run at all rejects.
 */
function runScript(scriptPath: string, home: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const options = { env: { HOME: home, PATH: '/usr/bin:/bin' }, timeout: 4000 };
    const child = execFile('/bin/sh', [scriptPath], options, (error) =>
      error !== null && (error.killed || typeof error.code === 'string') ? reject(error) : resolve(),
    );
    child.stdin?.end();
  });
}

describe('shellQuote', () => {
  it.each([
    ['plain', "'plain'"],
    ['with space', "'with space'"],
    ["it's", "'it'\\''s'"],
    ['$(rm -rf ~) `x` "y"', '\'$(rm -rf ~) `x` "y"\''],
  ])('quotes %j as one word', (text, quoted) => {
    expect(shellQuote(text)).toBe(quoted);
  });
});

describe('agentCommandLine', () => {
  it('passes the prompt as the last argument', () => {
    expect(agentCommandLine('claude-personal --model opus')).toBe(
      'claude-personal --model opus "$MBOARD_AGENT_PROMPT"',
    );
  });

  it('puts the prompt where the command says {prompt}', () => {
    expect(agentCommandLine('gemini -i {prompt}')).toBe('gemini -i "$MBOARD_AGENT_PROMPT"');
  });
});

describe('agentLaunchScript, run by /bin/sh', () => {
  let root: string;

  beforeEach(async () => {
    root = await createTemporaryFolder('mboard-launch-script-');
  });

  afterEach(async () => {
    await removeTemporaryFolder(root);
  });

  it('hands the prompt, unparsed, to the agent command in the board folder, and removes the launch folder', async () => {
    const boardFolder = path.join(root, "Vault's board");
    const launchFolder = path.join(root, 'launch folder');
    await mkdir(boardFolder);
    await mkdir(launchFolder);
    const prompt = 'List my work.\n\n- "quoted" $HOME `date` $(touch hacked) \'single\'\n> end';
    const promptFile = path.join(launchFolder, 'prompt.md');
    const scriptPath = path.join(launchFolder, 'open-agent.command');
    await writeFile(promptFile, prompt);
    await writeFile(
      scriptPath,
      agentLaunchScript({
        shell: '/bin/sh',
        workingDirectory: boardFolder,
        promptFile,
        launchFolder,
        command: "printf '%s' {prompt} > received.txt",
      }),
    );

    await runScript(scriptPath, root);

    expect(await readFile(path.join(boardFolder, 'received.txt'), 'utf8')).toBe(prompt);
    expect(existsSync(launchFolder)).toBe(false);
    expect(existsSync(path.join(boardFolder, 'hacked'))).toBe(false);
  });
});
