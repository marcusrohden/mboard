# Glossary

Terms used across mboard's code, specs and tickets. Use these words; avoid the listed alternatives.

## Board and folder

- **Board**: the one Kanban board mboard shows. One board folder holds one board.
- **Board folder**: the folder inside an Obsidian vault that holds the board: `tasks/`, `archive/` and `README.md`. mboard's only data store.
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
- **Due date**: an optional calendar date (no time of day) by which the task should be done.
- **Reminder**: one notification at 09:00 local time on a task's due date, caught up at launch if missed.

## Time and change

- **Date created**: the local date and time the task was created.
- **Date updated**: the local date and time of the task's last **update**.
- **Update**: an in-app change that bumps date updated and adds one history entry: creating, editing a field, moving to another column, adding a comment, archiving or restoring. Reordering within a column is not an update.
- **History log**: the task's append-only list of updates, one line each.
- **Comment**: a dated note added to a task. Append-only in the app.
- **Staleness**: how many local calendar days have passed since the task's date updated. Amber from 3 days, red from 7, never shown for complete or archived tasks.

## Archive

- **Archive**: moving a complete task off the board into `archive/`. Only tasks in Done can be archived.
- **Archived task**: a task whose file is in `archive/`. Read-only in the app apart from restore and delete.
- **Restore**: moving an archived task back to the top of Done.
- **Delete**: moving a task's file to the macOS Trash.
