import { describe, expect, it } from 'vitest';
import { latestCommentPosition, newestCommentsFirst, withCommentInDateOrder } from './comments';

const MIXED = [
  { at: '2026-11-12 10:00', text: 'Middle' },
  { at: '', text: 'Undated' },
  { at: '2026-11-14 09:00', text: 'Newest, added first' },
  { at: '2026-11-10 08:00', text: 'Oldest' },
  { at: '2026-11-14 09:00', text: 'Newest, added second' },
];

describe('newestCommentsFirst', () => {
  it('puts the newest comment first, the later of two from the same minute first, and undated ones last', () => {
    expect(newestCommentsFirst(MIXED).map((comment) => comment.text)).toEqual([
      'Newest, added second',
      'Newest, added first',
      'Middle',
      'Oldest',
      'Undated',
    ]);
  });

  it('leaves the comments it was given in their order', () => {
    const comments = [
      { at: '2026-11-10 08:00', text: 'Older' },
      { at: '2026-11-12 10:00', text: 'Newer' },
    ];
    newestCommentsFirst(comments);
    expect(comments.map((comment) => comment.text)).toEqual(['Older', 'Newer']);
  });
});

describe('latestCommentPosition', () => {
  it('finds the comment newestCommentsFirst puts first', () => {
    expect(latestCommentPosition(MIXED)).toBe(4);
  });

  it('takes the last of several undated comments when none has a date', () => {
    expect(
      latestCommentPosition([
        { at: '', text: 'One' },
        { at: '', text: 'Two' },
      ]),
    ).toBe(1);
  });

  it('is -1 without comments', () => {
    expect(latestCommentPosition([])).toBe(-1);
  });
});

describe('withCommentInDateOrder', () => {
  it('places the comment after the last one dated no later than it', () => {
    const comments = [
      { at: '2026-11-10 08:00', text: 'A' },
      { at: '2026-11-12 10:00', text: 'B' },
      { at: '2026-11-14 09:00', text: 'C' },
    ];
    expect(withCommentInDateOrder(comments, { at: '2026-11-12 10:00', text: 'New' }).map((c) => c.text)).toEqual([
      'A',
      'B',
      'New',
      'C',
    ]);
  });
});
