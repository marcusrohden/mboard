const GEAR_PATH =
  'M13.31 6.22 L15.25 6.52 L15.25 9.48 L13.31 9.78 L13.01 10.50 L14.17 12.08 L12.08 14.17 L10.50 13.01 L9.78 13.31 ' +
  'L9.48 15.25 L6.52 15.25 L6.22 13.31 L5.50 13.01 L3.92 14.17 L1.83 12.08 L2.99 10.50 L2.69 9.78 L0.75 9.48 ' +
  'L0.75 6.52 L2.69 6.22 L2.99 5.50 L1.83 3.92 L3.92 1.83 L5.50 2.99 L6.22 2.69 L6.52 0.75 L9.48 0.75 L9.78 2.69 ' +
  'L10.50 2.99 L12.08 1.83 L14.17 3.92 L13.01 5.50 Z M10.40 8.00 A2.4 2.4 0 1 0 5.60 8.00 A2.4 2.4 0 1 0 10.40 8.00 Z';

/** A 16 px gear drawn in the current text colour, for the Settings button. Hidden from assistive technology. */
export function SettingsIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
    >
      <path d={GEAR_PATH} fill="currentColor" fillRule="evenodd" />
    </svg>
  );
}
