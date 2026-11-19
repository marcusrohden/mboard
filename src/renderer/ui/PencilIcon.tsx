const PENCIL_PATH = 'M10.5 2.5 L13.5 5.5 L5.5 13.5 H2.5 V10.5 Z M8.5 4.5 L11.5 7.5';

/** A 16 px pencil drawn in the current text colour, for editing. Hidden from assistive technology. */
export function PencilIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d={PENCIL_PATH} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}
