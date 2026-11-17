import styles from './DownloadProgress.module.css';

/**
 * How much of a new version has downloaded, as a bar and a percentage. It sits outside the status line's
 * live region, so the percentage isn't read out at every step; the bar carries it for assistive technology.
 */
export function DownloadProgress({ percent }: { percent: number }) {
  return (
    <span className={styles.progress}>
      <progress className={styles.bar} max={100} value={percent} aria-label="Download progress" />
      <span aria-hidden="true" className={styles.percent}>
        {percent}%
      </span>
    </span>
  );
}
