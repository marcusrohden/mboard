# 1. Task files in the vault are mboard's only store

- Status: accepted (decided by the orchestrator under the user's delegation, 2026-11-16)

## Context

The board folder doubles as a memory source that people read in Obsidian and that agents will read after v1. Obsidian and, later, agents can change those files at any time.

## Decision

Each task is one markdown file in the board folder: flat frontmatter properties, plus Description, Comments and History sections. There is no database, index file or app-side copy of task data.

- **Derived from the files:** the project list for autocomplete.
- **App user-data folder:** only app settings and which reminders have fired.
- **Writes:** every write re-reads the file and applies one change, so outside edits survive. Writes are atomic, through a hidden temp file and a rename.
- **Outside edits:** shown as they are, never recorded in the history log, because the app can't attribute them.

## Consequences

- A reinstall loses nothing but settings, and the board can be reopened by choosing the same folder.
- Startup reads every task file (board and archive). That is fine for the expected scale, in the low thousands.
- Staleness doesn't reset when a task is changed outside the app, including by an Obsidian Kanban drag.
