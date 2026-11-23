# 14. Agent prompts are saved, with a version for every save, in their own file

- Status: accepted (asked for by the user, 2026-11-23)
- Qualifies: ADR 0011, for where the prompt comes from and what **Open agent** in the header does

## Context

**Open agent** started the agent straight away, with the one prompt kept in Settings › Agent (ADR 0011). The user wants several prompts for different jobs, to pick one each time, and to see and undo what changed in a prompt. They asked for: a dialog when **Open agent** is pressed, opening on the prompt they already had; the saved prompts in a sidebar; asking to save unsaved changes before showing another prompt; a change log in the style of `git diff`; and a version for every save, so an earlier one can be brought back.

`settings.json` is rewritten whole by every settings change, including the window bounds while the window moves, and its sanitiser keeps only the keys it knows. A prompt's every version, at up to 20,000 characters each, doesn't belong in a file written that often.

## Decision

- **Store:** the prompts live in `agent-prompts.json` in the user-data folder, beside `settings.json`, as `{ selectedId, prompts: [{ id, versions: [{ number, name, text, savedAt }] }] }`. Main makes the ids and stamps `savedAt` with its clock. Writes are atomic and one at a time, like `settings.json`. They are app data, not board data, so they stay out of the board folder (ADR 0001) and out of the agent's view.
- **Versions:** every save that changes the name or the text, once trimmed, adds the next version. Versions are never edited or removed; only deleting the prompt removes them. The latest version is the prompt as it is now.
- **Restore, not revert:** restoring a version puts its name and text in the editor as unsaved changes, and saving adds them as a new version. Nothing is thrown away, unlike a task's revert, which removes the later entries (ADR 0005).
- **Diff:** the domain computes a line diff, with the most lines kept, and groups it into hunks with three lines of context, as `git diff` does. Past a million line pairs it shows the changed middle as removed then added, which is still correct. The dialog shows it for unsaved changes and for each version against the one before.
- **Moving the old prompt:** the first launch with no `agent-prompts.json` writes one holding a single prompt, "Default prompt", with the `agent.prompt` that `settings.json` kept, read from the file as it is. It runs before anything can rewrite `settings.json`, whose sanitiser no longer keeps `prompt`. Without one, the default prompt is used.
- **Unreadable file:** prompts and versions that can't be read are dropped one by one. A file with nothing readable is moved aside, as `agent-prompts.unreadable-<date and time>.json`, and never overwritten.
- **Launch:** `openAgent(promptId)` takes the prompt's id, not its text. Main reads the latest version itself, as it already reads the settings and tasks, so the agent only ever starts with a saved version. Unsaved changes are saved, or dropped, first.
- **Dialog:** the header's **Open agent** now opens the Open agent dialog instead of starting the agent. It works while the agent's columns are empty, so prompts can still be edited; the dialog's own **Open agent** is off then. The dialog opens on the selected prompt, which is the one last shown in it.
- **Settings:** Settings › Agent keeps the terminal, the command and the columns, and no longer has a prompt field.
- **Limits:** a name is one line, at most 80 characters, and unique ignoring case. The text is at most 20,000 characters, as before. There is always at least one prompt.

## Consequences

- Pressing **Open agent** takes one more step: ⇧⌘O, then ⌘↵.
- `agent-prompts.json` grows with every save, by at most 20,000 characters a version, and nothing prunes it. A prompt saved thousands of times would make the file slow to rewrite; pruning old versions would need a decision about keeping them, so it is left until it matters.
- Downgrading to a version before this one finds no `agent.prompt` in `settings.json` and falls back to the default prompt; the saved prompts stay in `agent-prompts.json`.
- A selected prompt is remembered as soon as it is shown, so the dialog always reopens where the person left it, not on the prompt the agent last started with.
