import { useId } from 'react';

/**
 * The WKSL wordmark glyph: a bold geometric W drawn with round caps.
 *
 * `tone="chrome"` renders it as brushed metal — the reference look — using
 * stacked vertical gradient bands, a bright bevel on the upper edge, and a
 * darker copy offset behind for depth. It is vector, so it stays crisp from a
 * 17px favicon up to a 512px PWA icon.
 */
export function LogoMark({
  size = 18,
  className,
  tone = 'chrome',
}: {
  size?: number;
  className?: string;
  tone?: 'chrome' | 'current';
}) {
  // Several instances can be on the page at once, so gradient ids must be
  // unique or the browser will reuse the first definition it finds.
  const uid = useId().replace(/:/g, '');

  const path = 'M128 144 L208 368 L256 240 L304 368 L384 144';

  if (tone === 'current') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 512 512"
        fill="none"
        stroke="currentColor"
        strokeWidth={64}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-hidden
      >
        <path d={path} />
      </svg>
    );
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      fill="none"
      className={className}
      aria-hidden
    >
      <defs>
        {/*
          The banding is what sells it as metal: a bright sky reflection at the
          top, a dark horizon band, a second highlight, then shadowed steel
          underneath. Hard stops keep the edges crisp like a real reflection.
        */}
        <linearGradient id={`${uid}-body`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="12%" stopColor="#ecf1f6" />
          <stop offset="26%" stopColor="#96a1af" />
          <stop offset="42%" stopColor="#f8fbfd" />
          <stop offset="56%" stopColor="#808c9a" />
          <stop offset="72%" stopColor="#ced6de" />
          <stop offset="88%" stopColor="#606b78" />
          <stop offset="100%" stopColor="#3a424c" />
        </linearGradient>

        {/* Light that catches only the upper half of every stroke. */}
        <linearGradient id={`${uid}-bevel`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="42%" stopColor="#ffffff" stopOpacity="0.15" />
          <stop offset="60%" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="100%" stopColor="#0b0f14" stopOpacity="0.35" />
        </linearGradient>

        {/* The extruded side face, seen below the front surface. */}
        <linearGradient id={`${uid}-side`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#606a76" />
          <stop offset="100%" stopColor="#1a1f25" />
        </linearGradient>
      </defs>

      {/* Cast shadow on the backdrop. */}
      <path
        d={path}
        transform="translate(-26 34) scale(1.1)"
        stroke="#000"
        strokeOpacity={0.55}
        strokeWidth={60}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Extrusion, stepped back to front so the letter reads as a solid block. */}
      {[80, 64, 48, 32, 16].map((dy) => (
        <path
          key={dy}
          d={path}
          transform={`translate(${dy * 0.22} ${dy})`}
          stroke={`url(#${uid}-side)`}
          strokeWidth={60}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}

      {/* Lit front face, nudged up to leave room for the extrusion below. */}
      <g transform="translate(0 -10)">
        <path
          d={path}
          stroke={`url(#${uid}-body)`}
          strokeWidth={60}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d={path}
          stroke={`url(#${uid}-bevel)`}
          strokeWidth={60}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}
