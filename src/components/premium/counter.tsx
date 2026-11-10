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
      {current.toFixed(decimals)}
      {suffix}
    </span>
  );
}
