// Premium foundations — scroll hooks (hand-rolled, zero dependencies).
// IntersectionObserver + rAF + CSS only. All hooks respect
// prefers-reduced-motion: reduced-motion users get final states
// immediately (content fully visible, no animation).
"use client";

import { useEffect, useRef, useState } from "react";

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/** Page scroll progress, 0..1 (0 at top, 1 at bottom). rAF-throttled. */
export function useScrollProgress(): number {
  const [progress, setProgress] = useState(0);
  const reduced = usePrefersReducedMotion();
  useEffect(() => {
    if (reduced) return;
    let raf = 0;
    const update = () => {
      const el = document.documentElement;
      const max = el.scrollHeight - el.clientHeight;
      setProgress(max > 0 ? Math.min(1, Math.max(0, el.scrollTop / max)) : 0);
      raf = 0;
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [reduced]);
  return progress;
}

export type InViewOptions = {
  /** Intersection ratio that counts as visible (default 0.15). */
  threshold?: number;
  /** Fire once and stay visible (default true). */
  once?: boolean;
  /** Root margin, e.g. "0px 0px -10% 0px". */
  rootMargin?: string;
};

/**
 * IntersectionObserver in-view hook. Returns [ref, inView].
 * With `once` (default) the element stays visible after first entry.
 */
export function useInView<T extends HTMLElement = HTMLDivElement>(
  options: InViewOptions = {},
): [React.RefObject<T | null>, boolean] {
  const { threshold = 0.15, once = true, rootMargin } = options;
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    if (reduced) {
      setInView(true);
      return;
    }
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting) {
          setInView(true);
          if (once) io.disconnect();
        } else if (!once) {
          setInView(false);
        }
      },
      { threshold, rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold, once, rootMargin, reduced]);

  return [ref, inView];
}

/**
 * Scroll-linked progress for one element: 0 when the element's top
 * hits the viewport bottom, 1 when its bottom passes the viewport
 * top. rAF-throttled; drives scrubbed parallax / mockup transforms.
 */
export function useScrub<T extends HTMLElement = HTMLDivElement>(): [
  React.RefObject<T | null>,
  number,
] {
  const ref = useRef<T | null>(null);
  const [progress, setProgress] = useState(0);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    if (reduced) return;
    let raf = 0;
    const update = () => {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const total = vh + rect.height;
      const raw = total > 0 ? (vh - rect.top) / total : 0;
      setProgress(Math.min(1, Math.max(0, raw)));
      raf = 0;
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [reduced]);

  return [ref, progress];
}
