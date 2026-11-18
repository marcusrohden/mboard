/** A 16 px archive box drawn in the current text colour, for archiving a task. Hidden from assistive technology. */
export function ArchiveIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path
        d="M2 3 H14 V6 H2 Z M3 6 V13 H13 V6 M6.5 8.5 H9.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
