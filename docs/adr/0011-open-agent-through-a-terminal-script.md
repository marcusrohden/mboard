# 11. Open agent starts the person's own agent through a terminal script

- Status: accepted (asked for by the user, 2026-11-18)
- Reopens: "agent integration", out of v1 in spec section 1, for **Open agent** only

## Context

The user logs time from the tasks they finished. They want one button that opens their terminal (Ghostty), starts their AI agent with the tasks in Done and a prompt they wrote, and lets them carry on the conversation there. The agent differs between machines and accounts: `claude`, `codex`, or shell aliases such as `claude-personal`.

mboard is ad-hoc signed, and every merge ships a release (ADR 0008). An app launched from Finder doesn't see the person's interactive shell setup, such as aliases, functions and the PATH their shell profile builds.

## Decision

- **Settings:** `settings.json` gains `agent: { terminal, command, prompt, columns }`. The terminal is Ghostty or Terminal. The command is one line of the person's own shell, which may be an alias. The prompt is free text. The columns, at least one and Done by default, are the columns whose tasks the agent gets. Each field falls back to its default on its own. Main pushes the settings after each save, so the header knows whether those columns have tasks.
- **Prompt:** the domain composes one prompt: the Settings prompt, a `---` line, then every live task in the agent's columns, grouped by project and ordered by column, with its dates (when it entered its column), file path, description and comments. Comments include the move comments of ADR 0010.
- **Launch:** for each press, main writes the prompt and a `/bin/sh` script into a fresh temporary folder that only the person can read, then has the terminal run the script, through `open`:
  - **Terminal:** `open -b com.apple.Terminal <script>`, which runs a `.command` file in a new window.
  - **Ghostty:** handed a file, Ghostty asks "Allow Ghostty to execute …?" every time. So mboard starts a new Ghostty instead, `open -n -b com.mitchellh.ghostty --args --quit-after-last-window-closed=true --window-save-state=never -e /bin/sh <script>`, which runs the script in its first window without asking, quits when that window closes and leaves the person's other Ghostty windows alone.
  - The script moves to the board folder, reads the prompt into a variable and removes the temporary folder.
  - It then runs `exec "$SHELL" -ilc '<command> "$MBOARD_AGENT_PROMPT"; exec env -u MBOARD_AGENT_PROMPT "$SHELL" -il'`.
  - The person's interactive login shell resolves the command, so aliases and PATH work.
  - The prompt is always one double-quoted variable, so its text is never parsed as shell.
  - When the agent exits, the window carries on as a shell in the board folder.
- **Where the prompt goes:** at the end of the command, or wherever the command says `{prompt}`, for agents that take it behind a flag.
- **No Apple Events:** starting a terminal through Launch Services needs no Automation permission. Scripting Ghostty or Terminal through AppleScript would need one, and an ad-hoc-signed app that changes with every release might have to ask for it again after each update.
- **Limits:** the button is off while the agent's columns are empty. Main refuses to start an agent with no board, no tasks in its columns, or a prompt over 256 KiB, which keeps it well inside macOS's limit on a command's arguments.
- **Leftovers:** a temporary folder that a terminal never ran is removed by a later launch once it is an hour old.

## Consequences

- mboard now starts a program the person configured, in their own shell. A compromised renderer could already change settings; with this, it could save a command and run it. The renderer still only reaches main through validated IPC from the trusted origin, it renders task text as text, and the command runs visibly in a terminal window rather than in the background.
- Supporting another terminal means adding its bundle identifier and the `open` arguments that make it run a script.
- Each Ghostty launch is a Ghostty process of its own, with its own Dock icon, until its window closes.
- The agent gets a snapshot of its columns when the button is pressed. Later changes reach it only through the files in the board folder, where it starts.
- Whether a terminal asks before running a script it was handed is up to that terminal (spec, manual check M5). Ghostty 1.4.0 asks "Allow Ghostty to execute …?" for a script handed to it as a file but not for one started with `-e`, and a shell alias such as `claude-personal` resolves (checked by hand, 2026-11-18).
- Files the agent writes in the board folder are outside edits (ADR 0001), shown as they are and never recorded.
- A command that already gives the agent an opening prompt takes the place of mboard's. For example, an alias ending in `claude '/color green'` makes Claude run `/color green` and drop the rest. Such a command needs a variant without its own prompt, or `{prompt}` where the agent accepts a second one.
