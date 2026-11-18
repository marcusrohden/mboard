# 10. A move to another column asks for a comment, saved by the move's own update

- Status: accepted (asked for by the user, 2026-11-18)
- Qualifies: ADR 0005, ADR 0006

## Context

The column says who has the next step (ADR 0006), so a move is usually the moment something happened: work was handed to the client, a colleague came back, a task was finished. The user wants that moment explained on the task, and those notes are also what a timesheet is written from (ADR 0011).

Starting work, from To do to In progress, explains itself and happens often, so asking there would only add friction.

## Decision

- **When:** every in-app move to another column asks for a comment, apart from To do to In progress. Reordering within a column never asks. Archive, restore and revert aren't moves and don't ask either.
- **Every path:** the renderer asks at the command layer, so a drop, the drawer's column select, **Mark complete**, a card's **Complete** and ⌘1 to ⌘5 all ask the same way. Main doesn't require a comment, because the comment is optional.
- **Optional:** an empty comment moves the task without one. Cancelling leaves the task where it was, and a dropped task goes back.
- **One update:** `moveTask` takes the comment, and the move's own history entry adds it. The entry keeps the text `Moved from <old> to <new>`, and its ledger records the column change and the comment together. One write, one history entry and one revert point cover both, so no failure can leave a comment without its move.
- **Keyboard:** plain Enter in the comment box moves the task, at the user's request, and Shift+Enter starts a new line. ⌘↵ also moves, as in every dialog.

## Consequences

- A history entry can now carry a value change and a comments change in one ledger. ADR 0005 already allowed that shape. Reverting past such an entry restores the column and removes the comment.
- The history text of a move doesn't say whether a comment came with it. The comment shows under Comments, with the same time as the move.
- Outside edits, such as an agent changing `status`, still never ask for or record anything.
- If an outside edit has already moved the task to the target column when a move arrives, the move is only a reorder, and its comment is recorded as `Comment added`.
