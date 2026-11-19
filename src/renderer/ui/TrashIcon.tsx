/** A 16 px bin drawn in the current text colour, for deleting a task. Hidden from assistive technology. */
export function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path
        d="M2.5 4 H13.5 M6 4 V2.5 H10 V4 M3.5 4 L4.5 13.5 H11.5 L12.5 4 M6.5 6.5 V11 M9.5 6.5 V11"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
