# 13. Projects are notes that tasks link to, and can be renamed and merged

- Status: accepted (asked for by the user, 2026-11-19)
- Reopens: "project rename and merge", out of v1 in spec section 1
- Supersedes: where ADR 0007 keeps project colours
- Qualifies: ADR 0001, ADR 0002, ADR 0009

## Context

The user wants to edit a project from the header's Project list: change its name or its colour. A rename has to reach every task in the project, live and archived, with the project folders and the colour.

A project was only a name typed into each task's `project`, with its colour in `projects.md` under that name (ADR 0007). Renaming meant changing every task by hand, and the colour didn't follow. Archived tasks couldn't change at all, so an archived task filed under the wrong project stayed there.

The user asked for a reference system. Of the three ways weighed, they chose to make each project an Obsidian note that its tasks link to:

- A stable id in each task would make renames cheap. But it would make the task files unreadable to people and agents (ADR 0001) and need a migration. And because the README is never rewritten, agents would keep writing plain names, so a name lookup would be needed anyway.
- A plain name stays readable but gives Obsidian nothing to follow.
- A link to a project note keeps the name readable and gives each project a place in the vault: backlinks, the graph, and a note to write in.

## Decision

**Project notes.**

- Each project has a note in the board's `projects/` folder.
- The note's name is the project name cleaned the way its task folder is (ADR 0009), for example `projects/Acme website.md`. Names that clean the same share a note. A name with nothing left gets no note.
- The note's frontmatter `colour` is the project's colour, from the same palette as before. mboard writes only that and the `# <project>` heading it starts a note with. The rest of the note is the person's.
- Notes are matched ignoring case. A note whose frontmatter can't be read is listed as unreadable, gives no colour and is never written.
- A note is created when an in-app update first writes a link to it, when a colour is set, or when the Edit project dialog opens it. Opening a board, rescanning or an outside edit never creates one.

**Links.**

- When mboard writes a task, `project` is a double-quoted Obsidian link with the note's path from the vault's root and the project name as its display text, such as `project: "[[Work/Board/projects/Acme website|Acme website]]"`.
- Inside a vault the path makes the link unambiguous, which matters because a task named like its project, or another note with the same name, would otherwise compete for a short link.
- A board outside a vault gets short links, `[[Acme website]]`, and so does a board whose path in the vault holds `#`, `^`, `[`, `]` or `|`, which would break a path link.
- A link is written only when it reads back as the same project. A path link that wouldn't falls back to a short link, and a name neither works for, such as one holding `[`, `]` or `|`, or one like `notes.md`, is written as plain text.

**Reading.**

- `project` may be a plain name, a quoted link or an unquoted link (which YAML reads as a nested list). Plain names are read for good, because old READMEs and agents write them.
- A link names the project after the note it links to. Its display text gives the exact spelling while it still names that note once cleaned, so a name like `Acme: web` (note `Acme web`) survives.
- Once the note is renamed, for example in Obsidian, which rewrites a link's target but not its display text, the note's new name wins.
- The project inside mboard stays a plain name. History text, the ledger, search, filters, suggestions and the agent prompt are unchanged.

**No migration.**

- The file's own spelling of `project` is kept while it still names the project, so reordering never touches it and files mboard wrote still round-trip byte for byte.
- An update writes mboard's link instead of a plain name, or instead of a link whose display text no longer names its note. A link the person wrote to a note of their own is kept.
- Plain-name files move to links on their next update, as files moved into project folders in ADR 0009.

**Colours.**

- A project's colour is its note's `colour`, or else its entry in `projects.md`, which is now read only as a fallback.
- Setting a colour writes the note and removes the project's `projects.md` entry, so `projects.md` empties entry by entry.
- A project that can't have a note keeps its colour in `projects.md`.
- A colour still writes no task file and adds no history entry.

**Rename.**

- `renameProject(from, to)`, from the pencil beside each project in the header's Project list (⇧⌘P), changes `project` on every task with that project, matched ignoring case, live and archived.
  - Each task gains `Project renamed from A to B`, with a ledger entry, but its date updated stays as it was: renaming a project isn't work on its tasks, so their ages don't reset.
  - Each file moves to the new project's folder, and folders left empty go.
- The note is renamed, keeping its text and colour, and its mboard heading follows. A colour from `projects.md` moves into the note.
- Changing only the case of a name respells the note and the folders through a temporary name, because macOS volumes ignore case.
- Each task is read again before it changes, and one whose project an outside edit changed meanwhile is skipped.
- Nothing is written when the project's note or the target's note can't be read.
- A rename isn't atomic. When a task can't be written, it stops and says how far it got (`Renamed the project on N of M tasks, then stopped: …`), and renaming again finishes the rest.

**Merge.**

- A new name that matches another project ignoring case merges into it, after a confirmation in the dialog.
- The target keeps its spelling, note and colour, unless a colour is picked in the same save. The renamed project's note goes to the macOS Trash.

**Archived tasks.**

- An archived task's project can be changed from the drawer, with its colour. The file moves to `archive/<new folder>/`.
- Like a rename, the change adds a history entry but leaves date updated alone, so the archived task keeps its age.
- Everything else about an archived task stays read-only.

## Consequences

- This reopens "project rename and merge", out of v1 in spec section 1.
- It supersedes ADR 0007's store for colours: `projects.md` becomes a read-only fallback that empties as colours change. Renaming a project now carries its colour over.
- It qualifies ADR 0001: the board folder also holds project notes, which are the person's to write in.
- It qualifies ADR 0002 and the glossary's archived task, which was read-only apart from restore and delete: its project can now change too.
- It qualifies ADR 0009: a project's note is named the way its folder is.
- An update is still what bumps date updated, but two changes now add a history entry without being one: a project rename and an archived task's project change. Reverting a task to before a rename puts the old project back on that task only.
- Renaming in mboard is seen by Obsidian as an outside delete and create, so links to the old note from elsewhere in the vault break. Obsidian's help says it updates links when a file is renamed inside Obsidian, but not whether that includes links in properties. When it does, renaming a project's note in Obsidian renames the project: the tasks' links follow and mboard reads the note's new name. Their files move to the new folder on their next update. Otherwise those tasks keep the old project until it is renamed in mboard.
- Moving the board folder outside Obsidian leaves the path in links stale. mboard still reads the right project from the note's name, and writes fresh links when a task's project changes.
- A task file now says `project: "[[…|Acme website]]"` rather than `project: Acme website`. It is still readable, and agents may keep writing plain names.
- READMEs written before this ADR describe plain names and `projects.md`, because READMEs are never rewritten. Both are still read.
