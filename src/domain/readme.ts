import { PROJECT_COLOURS } from './projectColours';

const PALETTE_TEXT = `${PROJECT_COLOURS.slice(0, -1).join(', ')} or ${PROJECT_COLOURS.at(-1)}`;

/**
 * The text of the board folder's `README.md`, written once when the board is set up. It explains the
 * folder layout, the task file's properties and its body sections, so that a person or an AI agent can
 * read and write tasks correctly.
 */
export function buildBoardReadme(boardName: string): string {
  return `# ${boardName}

This folder is a Kanban board managed by mboard. Every task is one markdown file. There is no other data store, so anything you change here shows up on the board, and anything you change on the board is written here.

You can read and edit these files in Obsidian, in any editor, or with a script or an AI agent. mboard picks up outside changes as they happen.

## Folder layout

\`\`\`text
${boardName}/
├── README.md     this file
├── projects.md   project colours, once a project has one
├── tasks/        live tasks, in any column
│   ├── Acme website/   tasks of the project Acme website
│   └── Loose task.md   a task with no project
└── archive/      archived tasks, in project folders the same way
\`\`\`

- The column a task is in is its \`status\` property. The folder never encodes the column.
- The columns, left to right, are To do, In progress, Internal, With client and Done. \`Internal\` means the task is waiting on someone in my organisation, and \`With client\` means it is waiting on the client. A task can move between any of them.
- Only tasks in Done can be archived. Archiving moves the file from \`tasks/\` to \`archive/\` and adds \`archived\`. Restoring moves it back to the top of Done and removes \`archived\`.
- Tasks are grouped by project: a task with a \`project\` lives in a folder named after it inside \`tasks/\` (or \`archive/\`), and a task without one lives directly in \`tasks/\`. Put a new task file in its project's folder, or directly in \`tasks/\` when it has none. Only one level of folders is read.
- The \`project\` property, not the folder, decides the project. When mboard changes a task, it moves the file into the folder of its project, and removes a project folder it left empty.
- The file name is the title with characters that are unsafe in file names removed, for example \`Fix login bug.md\`. mboard renames the file when the title changes.

## A task file

\`\`\`markdown
---
title: "Why is the staging build failing?"
status: With client
project: Acme website
due: 2026-11-20
created: 2026-11-16T09:30:00
updated: 2026-11-16T14:03:12
order: 2
---

## Description

The staging pipeline fails at the asset step since Friday.

## Comments

### 2026-11-16 14:02

Asked the client for the staging credentials.

## History

- 2026-11-16 09:30 — Created in To do <!-- mboard-ledger {…} -->
- 2026-11-16 10:05 — Moved from To do to In progress <!-- mboard-ledger {…} -->
- 2026-11-16 14:02 — Comment added <!-- mboard-ledger {…} -->
- 2026-11-16 14:03 — Moved from In progress to With client <!-- mboard-ledger {…} -->
\`\`\`

## Properties

| Property | Meaning | Format |
| --- | --- | --- |
| \`title\` | The task's name | Text. Always double-quoted when mboard writes it. Falls back to the file name |
| \`status\` | The column | \`To do\`, \`In progress\`, \`Internal\`, \`With client\` or \`Done\`. Anything else reads as \`To do\` |
| \`project\` | An optional name that groups tasks | Text. Leave it out for none |
| \`due\` | The date the task should be done by | \`YYYY-MM-DD\`, no time of day. Leave it out for none |
| \`created\` | When the task was created | Local time, \`YYYY-MM-DDTHH:mm:ss\`, no offset |
| \`updated\` | When mboard last changed the task | Local time, \`YYYY-MM-DDTHH:mm:ss\`, no offset |
| \`archived\` | When the task was archived | Local time, \`YYYY-MM-DDTHH:mm:ss\`. Only in \`archive/\` |
| \`order\` | Position within its column, lowest first | A number. Tasks without one sort last |

- Keys are case-sensitive. An empty value (\`due:\` or \`due: null\`) is the same as leaving the key out.
- Other properties, such as \`tags\` or \`aliases\`, are kept as they are.
- A file with no frontmatter is still a task. The whole file is its description.
- A file whose frontmatter isn't valid YAML is listed as unreadable and is never changed.

## Body sections

| Heading | Content |
| --- | --- |
| \`## Description\` | Free markdown. Other headings inside it are fine, except the two below |
| \`## Comments\` | One \`### YYYY-MM-DD HH:mm\` heading per comment, then the comment text. Oldest first |
| \`## History\` | One line per change, \`- YYYY-MM-DD HH:mm — <what changed>\`, oldest first, usually followed by a hidden \`<!-- mboard-ledger {…} -->\` comment |

## Project colours

\`projects.md\` gives projects a colour on the board. Its frontmatter has \`colours\`, a mapping from project name to one of ${PALETTE_TEXT}. Names match each task's \`project\` ignoring case. mboard creates the file when a project first gets a colour, and you can edit it too.

\`\`\`markdown
---
colours:
  Acme website: teal
---
\`\`\`

## Editing tasks as a person or an agent

- To add a task, create a file in \`tasks/\` with the properties above. At least \`title\` and \`status\` are needed. Set \`created\` and \`updated\` to the current local time.
- To move a task, change \`status\`. To reorder it, change \`order\`.
- You don't need to update \`updated\` or the history. mboard never records outside edits in the history log, and it never rewrites a file just because you changed it.
- Leave the \`<!-- mboard-ledger … -->\` comments alone. Each one records exactly what that change did, so that mboard can revert the task to an earlier history entry.
- Your own edits aren't in the ledger. A revert keeps them, except in a field that a reverted change also touched. A history line you add yourself has no ledger comment, so mboard can't revert the task to a point before it.
- Don't put a line that is just \`## Comments\` or \`## History\` inside a description or a comment.
- Dates are local time with no offset. Don't add a time zone.
`;
}
