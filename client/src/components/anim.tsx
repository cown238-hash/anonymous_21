import { useEffect, useRef, useState } from 'react';
import { animate, motion, useInView, useReducedMotion, type Variants } from 'framer-motion';
import { formatNumber } from '../lib/format';

/**
 * Shared motion primitives. Everything honours the OS reduced-motion setting
 * through the top-level `MotionConfig reducedMotion="user"` in App — fades
 * still run, movement does not.
 */

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

/** Parent that staggers any `riseChild` inside it. */
export const staggerParent: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } },
};

/** Standard rise-and-fade entrance for a staggered child. */
export const riseChild: Variants = {
  hidden: { opacity: 0, y: 26 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: EASE } },
};

/** Fade wrapper for route changes — see `PageFade` use in Layout. */
export const pageFade: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.22, ease: 'easeOut' } },
  exit: { opacity: 0, y: -10, transition: { duration: 0.15, ease: 'easeIn' } },
};

/**
 * Number that counts 0 → value the first time it scrolls into view.
 * Used for the hero stats; `format` defaults to the same short formatter the
 * rest of the UI uses (9 → "9", 1200 → "1.2K").
 */
export function CountUp({ value, format = formatNumber }: { value: number; format?: (n: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.4 });
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(() => format(0));

  useEffect(() => {
    if (!inView) return;
    if (reduce) {
      setDisplay(format(value));
      return;
    }
    const controls = animate(0, value, {
      duration: 1.4,
      ease: EASE,
      onUpdate: (v) => setDisplay(format(Math.round(v))),
    });
    return () => controls.stop();
  }, [inView, value, format, reduce]);

  return <span ref={ref}>{display}</span>;
}

/**
 * Feed card entrance: rises into place once when scrolled into view.
 * `viewport.once` keeps it cheap — no listeners left behind after the reveal.
 */
export function RiseIn({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.45, ease: EASE, delay }}
      className={className}
    >
      {children}
    </motion.article>
  );
}

export { motion };
