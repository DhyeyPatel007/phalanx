// Premium foundations — Magnetic wrapper: translates toward the
// cursor and springs back on leave. Disabled on touch devices and
// under prefers-reduced-motion.
"use client";

import { useRef, useState, type ReactNode } from "react";

export function Magnetic({
  children,
  strength = 0.3,
  className = "",
}: {
  children: ReactNode;
  /** Fraction of the cursor offset applied (0..1, default 0.3). */
  strength?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [active, setActive] = useState(false);

  const enabled = () => {
    if (typeof window === "undefined") return false;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches)
      return false;
    if (window.matchMedia("(pointer: coarse)").matches) return false;
    return true;
  };

  const onMove = (e: React.MouseEvent) => {
    if (!enabled() || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const x = (e.clientX - (rect.left + rect.width / 2)) * strength;
    const y = (e.clientY - (rect.top + rect.height / 2)) * strength;
    setOffset({ x, y });
    setActive(true);
  };

  const onLeave = () => {
    setOffset({ x: 0, y: 0 });
    setActive(false);
  };

  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      className={`px-magnetic${active ? " is-magnetic" : ""} ${className}`}
      style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
    >
      {children}
    </div>
  );
}
