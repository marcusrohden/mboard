# 6. The column carries who has the next step; responsibility is removed

- Status: accepted (decided by the orchestrator under the user's delegation, 2026-11-17)
- Supersedes: the responsibility part of spec section 2 ([Project and responsibility fields](https://github.com/marcusrohden/mboard/issues/7))

## Context

Who had to take the next step on a task was a separate `responsibility` property, `Me`, `Client` or `Internal`, beside the three columns. A task waiting on someone else therefore sat in To do or In progress with a badge. Waiting tasks were scattered across two columns, and a Base grouped by `status` in Obsidian couldn't separate them at all.

ADR 0002 stores the column as the `status` property and notes that adding columns later only means new `status` values, not a folder migration.

## Decision

- **Columns:** `To do`, `In progress`, `Internal`, `With client`, `Done`, in that order. `status` holds the exact column name and is matched ignoring case and surrounding spaces.
  - **Internal:** the task is waiting on someone in my organisation.
  - **With client:** the task is waiting on the client.
  - Tasks move freely between any two columns. Complete still means Done, and archive and **Archive all** stay Done-only.
- **Responsibility is removed** from the model, the task file, the bridge contract, the card, the drawer, the New task dialog, the filters and the archived view.
- **Legacy files are mapped on read and fixed on the next write:**
  - A file whose status matches To do or In progress, with `responsibility` matching Client or Internal (ignoring case), reads as With client or Internal.
  - Done, the new columns, an unknown or missing status, and any other responsibility value (Me, unknown, empty) leave the status as it is.
  - `responsibility` stays a known key so it is never kept as an unknown one. The next app write drops it and writes the effective `status`.
  - That fix-up is not an update. It bumps no `updated` and adds no history entry, just like dropping a raw status spelling.
  - Archived files follow the same rule.
- **New-board README** lists the five status values and explains Internal and With client. Existing READMEs are never rewritten.

## Consequences

- No folder migration and no bulk rewrite: a file in the old shape keeps its `responsibility` key on disk until the app next writes it for any reason, including a reorder.
- Until then, Obsidian shows such a file under its old `status`, while mboard shows it under Internal or With client.
- Old history lines such as `Responsibility changed from Me to Client` stay as they are. New moves record `Moved from In progress to With client`.
- An agent following an old README may still write `responsibility`. Reading maps it the same way.
- Mapped tasks keep their `order`, so a merged column can hold equal orders. Sorting breaks ties by `created`, and a drop between equal orders renumbers the column as before.
- Five columns don't fit the 720 px minimum window at a readable width. Columns share the width down to 160 px each, and below that the board scrolls horizontally.
