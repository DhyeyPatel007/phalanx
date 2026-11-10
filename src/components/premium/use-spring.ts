// Premium foundations — small spring hook for numbers (rAF only).
// Used by SpringCounter; stiffness/damping in the usual spring sense
// (higher stiffness = faster, higher damping = less overshoot).
"use client";

import { useEffect, useRef, useState } from "react";

export type SpringOptions = {
  /** Spring stiffness (default 120). */
  stiffness?: number;
  /** Spring damping (default 18). */
  damping?: number;
  /** Snap when within this distance of target (default 0.01). */
  epsilon?: number;
};

/**
 * Animates a number toward `target` with a damped spring.
 * Returns the current value. Jumps straight to target when
 * prefers-reduced-motion is on.
 */
export function useSpring(
  target: number,
  options: SpringOptions = {},
): number {
  const { stiffness = 120, damping = 18, epsilon = 0.01 } = options;
  const [value, setValue] = useState(target);
  const stateRef = useRef({ value: target, velocity: 0 });
  const targetRef = useRef(target);
  targetRef.current = target;

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      stateRef.current = { value: target, velocity: 0 };
      setValue(target);
      return;
    }
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const s = stateRef.current;
      const t = targetRef.current;
      const accel = -stiffness * (s.value - t) - damping * s.velocity;
      s.velocity += accel * dt;
      s.value += s.velocity * dt;
      if (Math.abs(s.value - t) < epsilon && Math.abs(s.velocity) < epsilon) {
        s.value = t;
        s.velocity = 0;
        setValue(t);
        return;
      }
      setValue(s.value);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, stiffness, damping, epsilon]);

  return value;
}
