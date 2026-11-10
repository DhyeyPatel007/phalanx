// Premium foundations — public surface for the from-scratch rebuild.
// Hand-rolled scroll/motion primitives (IntersectionObserver + rAF +
// CSS only, zero new dependencies). Everything respects
// prefers-reduced-motion.
export { useScrollProgress, useInView, useScrub, usePrefersReducedMotion } from "./use-scroll";
export type { InViewOptions } from "./use-scroll";
export { useSpring } from "./use-spring";
export type { SpringOptions } from "./use-spring";
export { Magnetic } from "./magnetic";
export { Reveal, ScrollProgress } from "./reveal";
export { SpringCounter } from "./counter";
export { Marquee } from "./marquee";
export { CursorGlow } from "./glow";
