/** User-presentable reasons a board command is refused. The renderer shows them as they are. */
export const BoardMessage = {
  noBoardOpen: 'No board is open. Choose a board folder first.',
  invalidTaskId: "That isn't a valid task id.",
  taskMissing: "That task's file isn't there any more. It may have been moved or deleted outside mboard.",
  taskUnreadable: "That task's file couldn't be read, so mboard won't change it. Fix the file in Obsidian first.",
  archivedReadOnly: "An archived task's project is all that can change. Restore the task to change anything else.",
  alreadyArchived: 'That task is already archived.',
  notArchived: "That task isn't archived.",
  placedBeforeItself: "A task can't be placed before itself.",
  staleRevert: 'This task changed since you opened its history. Check it and try again.',
  boardFolderMissing: "The board folder can't be found. It may have been moved or renamed.",
  projectsFileUnreadable: "projects.md couldn't be read, so mboard won't change it. Fix the file in Obsidian first.",
  projectNameMissing: 'Choose a project before giving it a colour.',
  projectToRenameMissing: 'Choose the project to rename.',
  projectNewNameMissing: 'Give the project a name.',
  projectNoteUnreadable:
    "That project's note couldn't be read, so mboard won't change it. Fix the note in the projects folder first.",
  projectNoteTaken: 'Another project note already has that name. Rename or remove it in Obsidian first.',
  projectWithoutNote: "That project's name has nothing a note could be named after, so it has no note.",
} as const;

/** Builds the error a refused board command rejects with. */
export function boardError(message: string): Error {
  return new Error(message);
}
