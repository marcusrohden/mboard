import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';

const DRAG_STEPS = 30;
const PREVIEW_TOLERANCE_PX = 4;

interface Point {
  readonly x: number;
  readonly y: number;
}

test.use({
  board: {
    tasks: [
      { title: 'Write brief', status: 'To do', order: 1 },
      { title: 'Book venue', status: 'To do', order: 2 },
      { title: 'Draft agenda', status: 'In progress', order: 1 },
      { title: 'Send invites', status: 'In progress', order: 2 },
    ],
  },
});

async function boxOf(locator: Locator) {
  const box = await locator.boundingBox();
  if (box === null) throw new Error(`${locator.toString()} has no bounding box`);
  return box;
}

function column(page: Page, name: string, { includeHidden = false } = {}): Locator {
  return page.getByRole('region', { name, includeHidden });
}

/** Presses on `card` near its right edge, where a grab most easily overlaps the next column, and starts a drag. */
async function grabNearRightEdge(page: Page, card: Locator): Promise<{ grab: Point; offset: Point }> {
  const box = await boxOf(card);
  const offset = { x: box.width - 16, y: box.height / 2 };
  const grab = { x: box.x + offset.x, y: box.y + offset.y };
  await page.mouse.move(grab.x, grab.y);
  await page.mouse.down();
  await page.mouse.move(grab.x + 12, grab.y, { steps: 4 });
  return { grab, offset };
}

/** Moves the pointer just inside the left edge of `name`, halfway down, and returns where it ended. */
async function hoverJustInside(page: Page, name: string): Promise<Point> {
  const box = await boxOf(column(page, name));
  const pointer = { x: box.x + 24, y: box.y + box.height / 2 };
  await page.mouse.move(pointer.x, pointer.y, { steps: DRAG_STEPS });
  return pointer;
}

test('a dragged task follows the pointer and highlights only the column it will land in', async ({ mainWindow }) => {
  const card = mainWindow.getByRole('article', { name: 'Book venue' });
  const { offset } = await grabNearRightEdge(mainWindow, card);
  await expect(column(mainWindow, 'To do')).toHaveAttribute('data-drop-target', 'true');

  const pointer = await hoverJustInside(mainWindow, 'In progress');

  await expect(column(mainWindow, 'In progress')).toHaveAttribute('data-drop-target', 'true');
  await expect(mainWindow.locator('[data-drop-target]')).toHaveCount(1);
  const preview = await boxOf(mainWindow.locator('[data-dnd-overlay]'));
  expect(Math.abs(pointer.x - offset.x - preview.x)).toBeLessThanOrEqual(PREVIEW_TOLERANCE_PX);
  expect(Math.abs(pointer.y - offset.y - preview.y)).toBeLessThanOrEqual(PREVIEW_TOLERANCE_PX);

  await mainWindow.mouse.up();

  await expect(column(mainWindow, 'In progress').getByRole('article', { name: 'Book venue' })).toBeVisible();
  await expect(column(mainWindow, 'To do').getByRole('article', { name: 'Book venue' })).toHaveCount(0);
  await expect(mainWindow.locator('[data-drop-target]')).toHaveCount(0);
  await expect(mainWindow.locator('[data-drag-source]')).toHaveCount(0);
});

test('a drop that asks for a move comment keeps the task where it landed and moves it once confirmed', async ({
  mainWindow,
}) => {
  await grabNearRightEdge(mainWindow, mainWindow.getByRole('article', { name: 'Draft agenda' }));
  await hoverJustInside(mainWindow, 'Internal');
  await expect(column(mainWindow, 'Internal')).toHaveAttribute('data-drop-target', 'true');

  await mainWindow.mouse.up();

  const dialog = mainWindow.getByRole('dialog', { name: 'Move to Internal' });
  await expect(dialog).toBeVisible();
  await expect(mainWindow.locator('[data-drop-target]')).toHaveCount(0);
  const behindDialog = { includeHidden: true };
  await expect(
    column(mainWindow, 'Internal', behindDialog).getByRole('article', { name: 'Draft agenda', ...behindDialog }),
  ).toBeVisible();

  await dialog.getByRole('button', { name: 'Move' }).click();

  await expect(dialog).toBeHidden();
  await expect(column(mainWindow, 'Internal').getByRole('article', { name: 'Draft agenda' })).toBeVisible();
  await expect(column(mainWindow, 'In progress').getByRole('article', { name: 'Draft agenda' })).toHaveCount(0);
  await expect(mainWindow.locator('[data-drag-source]')).toHaveCount(0);
});
