import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { Status } from '../../shared/contract';
import type { MoveCommentRequest } from '../move-comment/use-move-comment-prompt';
import { ToastProvider } from '../notices/ToastProvider';
import { buildTask } from '../testing/builders';
import { useDomEnvironment } from '../testing/dom-environment';
import { createFakeMboard } from '../testing/fake-mboard';
import type { TaskSelection } from './use-task-selection';
import { useTaskCommands } from './use-task-commands';

useDomEnvironment();

const TASKS = [
  buildTask({ title: 'Waiting', status: 'To do', order: 1 }),
  buildTask({ title: 'Next', status: 'To do', order: 2 }),
  buildTask({ title: 'Working', status: 'In progress', order: 1 }),
];

const SELECTION: TaskSelection = {
  selectedId: null,
  selectedTask: null,
  open: () => undefined,
  close: () => undefined,
  beginCommand: () => undefined,
  endCommand: () => undefined,
  endCommandWithMoves: () => undefined,
};

function wrapper({ children }: { children: ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}

function renderCommands(answer: (request: MoveCommentRequest) => Promise<boolean>) {
  const fake = createFakeMboard({ tasks: TASKS });
  fake.install();
  const ask = vi.fn(answer);
  const { result } = renderHook(() => useTaskCommands(fake.tasks(), SELECTION, ask), { wrapper });
  return { fake, ask, commands: result.current };
}

describe('moving a dropped task', () => {
  it('asks for a comment before a drop in another column, and moves with it', async () => {
    const { fake, ask, commands } = renderCommands((request) => request.move('Handed over'));

    await act(() => commands.drop('tasks/Working.md', 'With client', null));

    expect(ask).toHaveBeenCalledWith(expect.objectContaining({ to: 'With client' }));
    expect(ask.mock.calls[0]?.[0].task.title).toBe('Working');
    expect(fake.api.moveTask).toHaveBeenCalledWith('tasks/Working.md', 'With client', null, 'Handed over');
  });

  it('resolves false and moves nothing when the comment is cancelled', async () => {
    const { fake, commands } = renderCommands(async () => false);

    let moved: boolean | undefined;
    await act(async () => {
      moved = await commands.drop('tasks/Working.md', 'Done', null);
    });

    expect(moved).toBe(false);
    expect(fake.api.moveTask).not.toHaveBeenCalled();
  });

  it.each<[string, string, Status, string | null]>([
    ['a reorder within the column', 'tasks/Next.md', 'To do', 'tasks/Waiting.md'],
    ['starting work, from To do to In progress', 'tasks/Waiting.md', 'In progress', null],
  ])('moves straight away for %s', async (_case, id, status, beforeId) => {
    const { fake, ask, commands } = renderCommands(async () => true);

    await act(() => commands.drop(id, status, beforeId));

    expect(ask).not.toHaveBeenCalled();
    expect(fake.api.moveTask).toHaveBeenCalledWith(id, status, beforeId, null);
  });
});
