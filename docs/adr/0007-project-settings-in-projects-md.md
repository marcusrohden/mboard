# 7. Project settings live in projects.md in the board folder

- Status: accepted (decided by the user, 2026-11-17)
- Qualifies: ADR 0001

## Context

Projects get a colour, so that a project's tasks stand out on the board. A colour belongs to the project, not to one task, and the user wants it kept with the board's other project information, not in the app's own settings on one Mac.

ADR 0001 makes the task files the only store and derives the project list from them. Storing the colour on every task file would mean rewriting every task in a project to change it, with conflicts whenever two tasks disagreed.

## Decision

- **One file:** `projects.md` at the root of the board folder, next to `README.md`, holds board-level project settings. Its frontmatter has `colours`, a mapping from project name to one of a fixed palette: red, orange, amber, green, teal, blue, indigo, purple, pink, brown.
- **Matching:** names match the task files' `project` ignoring case, as canonical project spelling already does. Unknown colours and names that aren't text are ignored.
- **Writes:** created on the first colour, never just by opening a board. Every write re-reads the file and changes one entry, keeping other keys, comments and the body, and is atomic like task writes.
- **Not an update:** setting a colour writes no task file and adds no history entry.
- **Outside edits:** the watcher also follows `projects.md`. A file whose frontmatter isn't valid YAML is listed as unreadable, read as having no colours, and never written.
- **Where it's set:** in the New task dialog when the project is new, and under the Project field in the task drawer.

## Consequences

- This qualifies ADR 0001: the task files stay the only store of task data, but the board folder now also holds board-level project settings.
- Colours sync with the vault and are readable by people and agents in Obsidian.
- Renaming a task's project doesn't carry the colour over. The new name starts with no colour, and the old entry stays until it's changed or removed.
- READMEs written before this ADR don't mention `projects.md`, because READMEs are never rewritten.
