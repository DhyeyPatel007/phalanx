// Premium foundations — SpringCounter: animates to a value when in
// view (spring physics), tabular numerals so columns never jitter.
"use client";

import { useInView } from "./use-scroll";
import { useSpring } from "./use-spring";

export function SpringCounter({
  value,
  prefix = "",
  suffix = "",
  decimals = 0,
  className = "",
  stiffness = 120,
  damping = 18,
}: {
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  className?: string;
  stiffness?: number;
  damping?: number;
}) {
  const [ref, inView] = useInView<HTMLSpanElement>();
  const current = useSpring(inView ? value : 0, { stiffness, damping });
  return (
    <span ref={ref} className={`px-counter ${className}`}>
      {prefix}
      {/* Counters only count non-negative quantities — clamp transient
          spring frames at 0 so an undershoot (e.g. scrolling the stat
          band out of view, target -> 0) never flashes a negative value.
          The settled value is untouched: every target is >= 0. */}
      {Math.max(0, current).toFixed(decimals)}
      {suffix}
    </span>
  );
}
