import type { ReactNode } from 'react';

export type IconName =
  | 'verdict'
  | 'search'
  | 'rows'
  | 'kanban'
  | 'star'
  | 'bars'
  | 'layers'
  | 'clock'
  | 'sliders'
  | 'lens';

/**
 * Clean line icons (replacing emoji per the taste audit). Every stroke carries
 * `pathLength={1}` and the `icon-stroke` class so GSAP can draw them in on
 * scroll. Decorative — the SVG is aria-hidden; meaning lives in the label.
 */
const PATHS: Record<IconName, ReactNode> = {
  verdict: (
    <>
      <circle className="icon-stroke" cx="12" cy="12" r="8" pathLength={1} />
      <path className="icon-stroke" d="M8.4 12.3l2.5 2.5 4.7-5.1" pathLength={1} />
    </>
  ),
  search: (
    <>
      <circle className="icon-stroke" cx="11" cy="11" r="6" pathLength={1} />
      <line className="icon-stroke" x1="15.5" y1="15.5" x2="20" y2="20" pathLength={1} />
    </>
  ),
  rows: (
    <>
      <line className="icon-stroke" x1="5" y1="8" x2="19" y2="8" pathLength={1} />
      <line className="icon-stroke" x1="5" y1="12" x2="19" y2="12" pathLength={1} />
      <line className="icon-stroke" x1="5" y1="16" x2="14" y2="16" pathLength={1} />
    </>
  ),
  kanban: (
    <>
      <rect className="icon-stroke" x="4.5" y="5" width="4" height="14" rx="1.3" pathLength={1} />
      <rect className="icon-stroke" x="10" y="5" width="4" height="10" rx="1.3" pathLength={1} />
      <rect className="icon-stroke" x="15.5" y="5" width="4" height="14" rx="1.3" pathLength={1} />
    </>
  ),
  star: (
    <path
      className="icon-stroke"
      d="M12 4.2l2.3 4.7 5.2.8-3.8 3.7.9 5.1-4.6-2.4-4.6 2.4.9-5.1L6.5 9.7l5.2-.8z"
      pathLength={1}
    />
  ),
  bars: (
    <>
      <line className="icon-stroke" x1="7" y1="19" x2="7" y2="12.5" pathLength={1} />
      <line className="icon-stroke" x1="12" y1="19" x2="12" y2="6" pathLength={1} />
      <line className="icon-stroke" x1="17" y1="19" x2="17" y2="14.5" pathLength={1} />
    </>
  ),
  layers: (
    <>
      <path className="icon-stroke" d="M12 4l8 4-8 4-8-4z" pathLength={1} />
      <path className="icon-stroke" d="M4 12l8 4 8-4" pathLength={1} />
      <path className="icon-stroke" d="M4 16l8 4 8-4" pathLength={1} />
    </>
  ),
  clock: (
    <>
      <circle className="icon-stroke" cx="12" cy="12" r="8" pathLength={1} />
      <path className="icon-stroke" d="M12 7.8v4.4l2.8 1.7" pathLength={1} />
    </>
  ),
  sliders: (
    <>
      <line className="icon-stroke" x1="4" y1="8.5" x2="20" y2="8.5" pathLength={1} />
      <circle className="icon-stroke" cx="9" cy="8.5" r="2.2" pathLength={1} />
      <line className="icon-stroke" x1="4" y1="15.5" x2="20" y2="15.5" pathLength={1} />
      <circle className="icon-stroke" cx="15" cy="15.5" r="2.2" pathLength={1} />
    </>
  ),
  lens: (
    <>
      <circle className="icon-stroke" cx="12" cy="12" r="8" pathLength={1} />
      <circle className="icon-stroke" cx="12" cy="12" r="3.4" pathLength={1} />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
    </>
  ),
};

type Props = {
  name: IconName;
  size?: number;
  className?: string;
};

export function Icon({ name, size = 24, className }: Props) {
  return (
    <svg
      className={`icon ${className ?? ''}`.trim()}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
