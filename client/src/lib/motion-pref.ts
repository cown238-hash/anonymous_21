import { useSyncExternalStore } from 'react';

export type MotionPref = 'auto' | 'on' | 'off';

const KEY = 'wksl.motion';

/**
 * In-app motion preference. `auto` follows the OS (`prefers-reduced-motion`),
 * while `on`/`off` force motion on or off regardless of the OS setting.
 *
 * This exists because "nothing moves" is otherwise indistinguishable from a
 * bug: on Windows, turning off *Settings → Accessibility → Visual effects →
 * Animation effects* makes Chrome report `prefers-reduced-motion: reduce`,
 * which silences every animation in the app by design.
 */
export function getMotionPref(): MotionPref {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'on' || v === 'off') return v;
  } catch {
    /* private mode: fall back to auto */
  }
  return 'auto';
}

function subscribe(cb: () => void): () => void {
  window.addEventListener('wksl:motion', cb);
  return () => window.removeEventListener('wksl:motion', cb);
}

export function useMotionPref(): MotionPref {
  return useSyncExternalStore(subscribe, getMotionPref, () => 'auto' as MotionPref);
}

export function setMotionPref(pref: MotionPref): void {
  try {
    localStorage.setItem(KEY, pref);
  } catch {
    /* private mode: still apply for this session */
  }
  document.documentElement.dataset.motion = pref;
  window.dispatchEvent(new Event('wksl:motion'));
}

/** framer-motion's `reducedMotion` for a given preference. */
export function toReducedMotion(pref: MotionPref): 'user' | 'never' | 'always' {
  if (pref === 'on') return 'never';
  if (pref === 'off') return 'always';
  return 'user';
}
