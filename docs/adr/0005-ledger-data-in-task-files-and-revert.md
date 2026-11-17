# 5. Ledger data lives in the task file's history lines, and revert replays it backwards

- Status: accepted (decided by the ledger agent under the orchestrator's brief, 2026-11-17)

## Context

mboard is used in a corporate setting, where it matters exactly what changed on a task and when, and where a mistaken change should be easy to take back. Until now each history entry was a line of text with a minute timestamp, and "Description edited" said nothing about the text itself.

ADR 0001 makes the task files the only store: there is no database to keep an audit trail or undo stack in. People and agents also edit the files directly, and those outside edits are never recorded.

## Decision

**Ledger data.** Every in-app update stores what it changed with its history entry, as a hidden HTML comment at the end of that entry's line:

```markdown
- 2026-11-16 14:02 — Title changed from "A" to "B" <!-- mboard-ledger {"v":1,"at":"2026-11-16T14:02:37","changes":[{"field":"title","from":"A","to":"B"}]} -->
```

- **Shape:** versioned (`v: 1`), with `at` to the second, and a list of changes. A value change is `{field, from, to}`, generic over the fields `title`, `status`, `responsibility`, `project`, `due`, `description` (full old and new text) and `archived`. A comment change is `{field: "comments", added, removed}`, so that a revert that removes comments can itself be reverted.
- **Encoding:** readable JSON rather than base64, so that people, agents and `grep` can read it. `JSON.stringify` already escapes line breaks and control characters; mboard also escapes `<`, `>`, U+2028, U+2029 and a `-` that starts a `--` run as `\uXXXX`. The comment is therefore always one line, nothing in it can close it early, and CommonMark and Obsidian render it as a comment.
- **Reading:** only a comment at the very end of a line counts, so history text that quotes the marker (a title, say) stays text. A line without a valid version 1 comment is a **legacy entry** and is written back unchanged. A change to a field this version doesn't track is kept and written back, but never reverted, so files written by other versions still read and round-trip. A file the app wrote still round-trips byte for byte.

**Revert.** Reverting to entry k gives the state right after k:

- The entries after k are undone newest first: a field gets its `from` value back, added comments are removed, removed comments come back in date order.
- A field no later entry touched keeps its current value. Outside edits to it survive; an outside edit to a field a later entry touched is replaced, because the revert puts that field back to how it was at k.
- The history keeps entries 0..k and gains one entry, `Reverted to <d MMM HH:mm> — N changes discarded`, whose ledger records what the revert changed. The discarded entries are gone from the file; the revert entry can itself be reverted.
- It is allowed only for a live task, a dated entry that isn't the latest, ledger data on every later entry, and a state after k in which the task wasn't archived.
- The request carries a fingerprint of entry k as the person saw it (the history's length, and k's time and text). Main refuses the revert if the file no longer matches, rather than reverting to the wrong point.

## Consequences

- The history log is no longer strictly append-only: a revert removes the entries after its target. The glossary says so.
- This qualifies ADR 0001, whose read-modify-write keeps outside edits: a revert keeps them only in fields that no reverted change touched, and replaces the rest with their value at the target entry.
- Files grow: each description edit stores the old and the new text. That is fine at the expected scale.
- Older tasks can't be reverted past their legacy entries. Nothing is migrated or back-filled.
- Outside edits stay unrecorded (ADR 0001). A hand-edited ledger comment that still parses is trusted; one that doesn't parse turns that line into a legacy entry.
- Obsidian hides the comments in reading view but shows them in source view. The board README asks agents to leave them alone.
- When a field is dropped from the board, its row in the tracked fields goes too; ledger data that names it is still read, kept and ignored by revert.
