import { flushSync } from 'react-dom';

type ViewTransitionDocument = Document & {
  startViewTransition?: (callback: () => void) => unknown;
};

/**
 * Flip the theme with the top→bottom "scan" reveal (see ::view-transition-new
 * in global.css). `flushSync` makes next-themes apply the class synchronously
 * so the View Transition snapshots the new theme. Falls back to an instant flip
 * where the API is missing or motion is reduced.
 *
 * Shared by the manual toggle (ThemeToggle) and the scroll watcher (ScrollTheme).
 */
export function scanToTheme(setTheme: (theme: string) => void, next: string): void {
  const doc = document as ViewTransitionDocument;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || typeof doc.startViewTransition !== 'function') {
    setTheme(next);
    return;
  }
  doc.startViewTransition(() => flushSync(() => setTheme(next)));
}
