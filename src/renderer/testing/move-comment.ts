import { screen, within } from '@testing-library/react';
import type userEvent from '@testing-library/user-event';

type User = ReturnType<typeof userEvent.setup>;

/** The open move comment dialog, `Move to <column>`. Test-only. */
export function moveCommentDialog(to: string): Promise<HTMLElement> {
  return screen.findByRole('dialog', { name: `Move to ${to}` });
}

/** Answers the move comment dialog for a move to `to`: types `comment`, if any, then presses Enter. Test-only. */
export async function answerMoveComment(user: User, to: string, comment = ''): Promise<void> {
  const dialog = await moveCommentDialog(to);
  const box = within(dialog).getByLabelText('Comment (optional)');
  if (comment === '') box.focus();
  else await user.type(box, comment);
  await user.keyboard('{Enter}');
}
