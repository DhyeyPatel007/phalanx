// Premium foundations — CursorGlow card wrapper: cursor-follow
// radial glow via --mouse-x/--mouse-y, like the existing spotlight
// but reusable on any card. No glow under reduced-motion / touch.
"use client";

import { useRef, useState, type ReactNode } from "react";

export function CursorGlow({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 50, y: 50 });

  const onMove = (e: React.MouseEvent) => {
    if (!ref.current) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches)
      return;
    const rect = ref.current.getBoundingClientRect();
    setPos({
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    });
  };

  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      className={`px-glow ${className}`}
      style={
        {
          "--mouse-x": `${pos.x}%`,
          "--mouse-y": `${pos.y}%`,
        } as React.CSSProperties
      }
    >
      {children}
    </div>
  );
}
