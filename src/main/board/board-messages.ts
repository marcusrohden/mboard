/** User-presentable reasons a board command is refused. The renderer shows them as they are. */
export const BoardMessage = {
  noBoardOpen: 'No board is open. Choose a board folder first.',
  invalidTaskId: "That isn't a valid task id.",
  taskMissing: "That task's file isn't there any more. It may have been moved or deleted outside mboard.",
  taskUnreadable: "That task's file couldn't be read, so mboard won't change it. Fix the file in Obsidian first.",
  archivedReadOnly: "Archived tasks can't be changed. Restore the task first.",
  alreadyArchived: 'That task is already archived.',
  notArchived: "That task isn't archived.",
  placedBeforeItself: "A task can't be placed before itself.",
  boardFolderMissing: "The board folder can't be found. It may have been moved or renamed.",
} as const;

/** Builds the error a refused board command rejects with. */
export function boardError(message: string): Error {
  return new Error(message);
}
