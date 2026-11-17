# Glossary

Terms used across mboard's code, specs and tickets. Use these words; avoid the listed alternatives.

## Board and folder

- **Board**: the one Kanban board mboard shows. One board folder holds one board.
- **Board folder**: the folder inside an Obsidian vault that holds the board: `tasks/`, `archive/`, `README.md` and, once a project has a colour, `projects.md`. mboard's only data store.
- **Vault**: an Obsidian vault, recognised by a `.obsidian/` config folder at its root.
- **Outside edit**: any change to a file in the board folder that mboard didn't make itself, for example an edit in Obsidian, an Obsidian Kanban drag or an agent writing a file. Shown as it is; never recorded in the history log.

## Task

- **Task**: the unit of work on the board, stored as one markdown file. _Avoid_: card, item, ticket (a ticket is an issue on the wayfinder map).
- **Column**: one of the board's five fixed stages: To do, In progress, Internal, With client, Done. A task's column is its **status**, and it can move between any two columns. The column also says who has the next step: me in To do and In progress, someone else in Internal and With client.
- **Internal**: the column for a task waiting on someone else in my organisation. _Avoid_: blocked, on hold.
- **With client**: the column for a task waiting on the client. _Avoid_: Client on its own (the removed responsibility value), blocked.
- **Complete**: a task is complete when it is in Done. _Avoid_: closed, finished.
- **Order**: a task's manual position within its column.
- **Responsibility**: _removed_ (ADR 0006). It was a separate Me, Client or Internal property for who had the next step; the Internal and With client columns replace it. Older files may still carry a `responsibility` key: on a To do or In progress task, Client or Internal reads as With client or Internal, and the key is dropped on the next write. _Avoid_: owner, assignee.
- **Project**: an optional free-text name grouping tasks. The list of projects is derived from the task files.
- **Project colour**: one of a fixed palette (red, orange, amber, green, teal, blue, indigo, purple, pink, brown) that a project's name is shown in on the board. Kept in the projects file, matched to projects ignoring case. _Avoid_: label colour, tag.
- **Projects file**: `projects.md` at the root of the board folder, holding board-level project settings such as project colours (ADR 0007).
- **Due date**: an optional calendar date (no time of day) by which the task should be done.
- **Reminder**: one notification at 09:00 local time on a task's due date, caught up at launch if missed.

## Time and change

- **Date created**: the local date and time the task was created.
- **Date updated**: the local date and time of the task's last **update**.
- **Update**: an in-app change that bumps date updated and adds one history entry: creating, editing a field, moving to another column, adding a comment, archiving, restoring or reverting. Reordering within a column is not an update.
- **History log**: the task's list of updates, one line each, oldest first. Append-only, except that a revert removes the entries after the one it reverts to.
- **Ledger**: the data kept with each history entry, as a hidden comment on its line, recording exactly what that update changed and when, to the second. It is what makes an update revertible. Entries without it are **legacy entries**.
- **Revert**: returning a task to its state right after an earlier history entry, by undoing the later updates from their ledger. Fields those updates didn't touch keep their current value, and the later entries are replaced by one revert entry. _Avoid_: undo, rollback.
- **Comment**: a dated note added to a task. Append-only in the app, except that a revert removes the comments added after the entry it reverts to.
- **Staleness**: how many working days (Monday to Friday, by local date) have passed since the task's date updated, and the **age tier** that follows from it: On track (green), Needs a nudge (amber), Stalling (orange) and Stale (red). Complete and archived tasks are grey and keep their count.
- **Age thresholds**: the working days from which Needs a nudge, Stalling and Stale start, set in Settings under **Age colours**. The defaults are 2, 4 and 6, so On track is 0–1, Needs a nudge 2–3, Stalling 4–5 and Stale 6 or more. _Avoid_: legend (the Settings section that shows them), limits.
- **Age chip**: the `Nd` working-day count on every task, coloured by its age tier.

## Archive

- **Archive**: moving a complete task off the board into `archive/`. Only tasks in Done can be archived.
- **Archived task**: a task whose file is in `archive/`. Read-only in the app apart from restore and delete.
- **Restore**: moving an archived task back to the top of Done.
- **Delete**: moving a task's file to the macOS Trash.

## App

- **Settings**: the dialog that holds mboard's own settings: the board folder, open at login, notifications and app updates. Opened with the header's gear, **Settings…** in the app and tray menus, or Cmd+,.
- **Release**: a published version of mboard: a `vX.Y.Z` tag and its GitHub release, with the macOS zip attached. release-please cuts one when its release PR is merged.
- **New version**: a release newer than the running copy of mboard.
- **App update**: replacing the running copy of mboard with a new version, from inside the app. _Avoid_: update (that's a task update), upgrade.
