# 2. The column is a `status` property; the archive is a folder

- Status: accepted (decided by the orchestrator under the user's delegation, 2026-11-16)

## Context

Obsidian 1.14's Bases Kanban groups notes into columns by a property or by folder, and rewrites that property (or moves the file) when a card is dragged.

## Decision

- **Column:** stored as the text property `status`, whose value is the column name (`To do`, `In progress` or `Done`). The folder layout never encodes the column.
- **Archive:** archived tasks live in `archive/`. Live tasks, whatever their column, live in `tasks/`.

## Consequences

- A Base grouped by `status` over `tasks/` shows the same board in Obsidian, and its drags reach mboard as outside edits.
- Adding columns later only means new `status` values, not a folder migration.
- The live board can be loaded and watched without walking a large archive.
