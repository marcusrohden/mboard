import type { Task } from '../../shared/contract';

/** How many tasks have a project, matched ignoring case, and how many of them are archived. */
export interface ProjectImpact {
  total: number;
  archived: number;
}

function isInProject(task: Task, project: string): boolean {
  return task.project !== null && task.project.toLowerCase() === project.toLowerCase();
}

/** The tasks, live and archived, that renaming `project` changes. */
export function projectImpact(tasks: readonly Task[], project: string): ProjectImpact {
  const inProject = tasks.filter((task) => isInProject(task, project));
  return { total: inProject.length, archived: inProject.filter((task) => task.isArchived).length };
}

/**
 * The spelling of another project that `name` matches ignoring case, which renaming `project` to `name`
 * would merge into, or `null` when there is none.
 */
export function mergeTargetFor(tasks: readonly Task[], project: string, name: string): string | null {
  const other = tasks.find((task) => isInProject(task, name) && !isInProject(task, project));
  return other?.project ?? null;
}

/** `1 task` or `N tasks`. */
export function taskCount(count: number): string {
  return count === 1 ? '1 task' : `${count} tasks`;
}

/** What a rename changes, in words, for example `6 tasks, 2 of them archived`. */
export function describeImpact({ total, archived }: ProjectImpact): string {
  if (archived === 0) return taskCount(total);
  if (archived === total) return `${taskCount(total)}, ${total === 1 ? 'archived' : 'all archived'}`;
  return `${taskCount(total)}, ${archived} of them archived`;
}
