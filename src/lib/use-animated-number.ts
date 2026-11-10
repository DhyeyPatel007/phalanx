// useAnimatedNumber — counts 0 -> target (and between values on change)
// with requestAnimationFrame, ease-out cubic, over `duration` ms.
// Instant when the user prefers reduced motion. Pure display hook: it
// never invents a value, it only animates the real one it is given.
"use client";

import { useEffect, useRef, useState } from "react";

export function useAnimatedNumber(target: number, duration = 600): number {
  const [shown, setShown] = useState(0);
  const prevRef = useRef(0);

  useEffect(() => {
    const from = prevRef.current;
    prevRef.current = target;
    if (from === target) {
      setShown(target);
      return;
    }
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setShown(target);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(from + (target - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return shown;
}
