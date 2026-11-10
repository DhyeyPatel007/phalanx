// Premium foundations — Reveal (fade + rise on inView, stagger via
// delay) and ScrollProgress (fixed top progress hairline).
"use client";

import type { CSSProperties, ReactNode } from "react";
import { useInView, useScrollProgress } from "./use-scroll";

export function Reveal({
  children,
  delay = 0,
  className = "",
  as: Tag = "div",
}: {
  children: ReactNode;
  /** Stagger delay in ms. */
  delay?: number;
  className?: string;
  as?: "div" | "section" | "span";
}) {
  const [ref, inView] = useInView<HTMLDivElement>();
  const style = {
    "--reveal-delay": `${delay}ms`,
  } as CSSProperties;
  return (
    <Tag
      ref={ref as never}
      style={style}
      className={`px-reveal${inView ? " is-visible" : ""} ${className}`}
    >
      {children}
    </Tag>
  );
}

export function ScrollProgress() {
  const progress = useScrollProgress();
  const style = {
    "--scroll-progress": progress,
  } as CSSProperties;
  return (
    <div
      className="px-scroll-progress"
      aria-hidden="true"
      role="presentation"
    >
      <div className="px-scroll-progress-bar" style={style} />
    </div>
  );
}
