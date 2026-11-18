const BUBBLE_PATH =
  'M3 2.5 H13 A1.5 1.5 0 0 1 14.5 4 V10 A1.5 1.5 0 0 1 13 11.5 H7.5 L4.5 14 V11.5 H3 ' +
  'A1.5 1.5 0 0 1 1.5 10 V4 A1.5 1.5 0 0 1 3 2.5 Z';

/** A 16 px speech bubble drawn in the current text colour, for comments. Hidden from assistive technology. */
export function CommentIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d={BUBBLE_PATH} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}
