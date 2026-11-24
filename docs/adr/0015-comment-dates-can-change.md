# 15. A comment's date can change, and date updated follows the latest comment

- Status: accepted (asked for by the user, 2026-11-24)
- Qualifies: ADR 0005, ADR 0010
- Reopens: editing comments in the app, out of v1

## Context

Comments are often written after the fact: the client replied on Friday, but the comment goes in on Monday. The comment then carries Monday's time, and the task's age starts again from Monday, so the board shows a task as fresher than it is. The user wants to give such a comment the time it really happened, and wants the task's age to follow when that comment is the last word on the task. Changing an older comment's date shouldn't move the task's age.

## Decision

- **What can change:** only a comment's date and time, never its text. Any comment on a live task can be changed, including an undated one, which gains a date. Archived tasks stay read-only.
- **Bounds:** the new date and time is kept to the minute and must lie between the task's creation and now. Main refuses anything else.
- **Latest comment:** the one with the newest date and time. Of two from the same minute, the one later in the file wins, and undated comments come last. The drawer lists comments in that order, newest first, so the comment at the top is the latest. `latestCommentPosition` in `src/domain/comments.ts` is the one definition.
- **Date updated:** when the changed comment was the latest before the change, date updated becomes its new date and time, so the task's age follows it. That holds even when the new date puts it behind another comment. A change to any other comment leaves date updated as it was.
- **History:** every change adds `Comment date changed from <old> to <new>`, with `(none)` for an undated comment, dated now. Its ledger records the comment as removed with its old date and added with its new one, so a revert puts the old date back without changes to the revert itself.
- **File order:** the comment moves to its place in date order in the file, as a revert already places comments it brings back.
- **Stale view:** the request carries the comment's time and text as the person saw them. When no comment matches any more, for example after an outside edit, main refuses and writes nothing.

## Consequences

- A comment date change is a third kind of history entry, beside an update and a quiet project change (ADR 0013). It never sets date updated to now, and it sets it to the comment's date only for the latest comment.
- Date updated can move backwards, to before later updates such as a field edit, when the latest comment is dated earlier. That is the point: the age shows when the latest comment says the work happened.
- Reverting past a date change sets date updated to now, as every revert does.
- Outside edits to a comment's heading are still never recorded.
