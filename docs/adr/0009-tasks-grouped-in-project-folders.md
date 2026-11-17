# 9. Task files are grouped in project folders

- Status: accepted (asked for by the user; the details decided by the orchestrator under the user's delegation, 2026-11-18)
- Qualifies: ADR 0002

## Context

The user wants the board's tasks grouped by project on disk, so that a project's tasks sit together in Obsidian and in any other tool that browses the vault.

ADR 0002 keeps every live task directly in `tasks/` and every archived task directly in `archive/`, and says the folder never encodes the column. A task's project changes far less often than its column, so tying the folder to the project moves files rarely.

## Decision

- **Layout:** a task with a project lives in `tasks/<project folder>/`, or `archive/<project folder>/` once archived. A task without a project lives directly in `tasks/` or `archive/`. The column still never maps to a folder.
- **Folder name:** the project name cleaned like a file name stem. A name with nothing left gets no folder. A folder already there under the same name ignoring case is used as it is spelled, because macOS volumes ignore case. If a file already has that name, the task stays directly in the task folder.
- **Depth:** exactly one level. Files deeper down and files in hidden folders aren't tasks.
- **Source of truth:** the `project` property. The folder is only where in-app writes put the file. It is never read back as data, so a file whose folder disagrees with its project still belongs to its `project`.
- **When files move:** every update puts the file in its project's folder: create, any edit, comment, column move, archive, restore and revert. Reordering a neighbour is not an update and never moves its file. Opening a board, or an outside edit, never moves a file, so files written before this ADR move on their next update.
- **Tidying:** a project folder that a move or delete leaves empty is removed. One that still holds anything, even a hidden file, stays.
- **Task ids:** `tasks/<name>.md`, `archive/<name>.md`, `tasks/<project folder>/<name>.md` or `archive/<project folder>/<name>.md`, with no part starting with a dot.

## Consequences

- This qualifies ADR 0002: the column is still the `status` property, but the folder now also reflects the project.
- Changing a task's project, from mboard or from an update after an outside edit, changes its id and path. The drawer already follows a task to its new id, as it does after a rename.
- Tasks in different projects can share a file name.
- A board stays mixed, with older tasks directly in `tasks/`, until each of them is updated. mboard never moves files by itself just because a board was opened.
- A view in Obsidian that lists only the files directly in `tasks/` no longer shows the whole board.
- Two project names that clean to the same folder name share that folder.
- READMEs written before this ADR still say to put task files directly in `tasks/`, because READMEs are never rewritten.
