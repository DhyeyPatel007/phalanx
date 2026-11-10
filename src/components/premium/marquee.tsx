// Premium foundations — Marquee: CSS-animated, pause on hover,
// reduced-motion safe (track goes static, content stays readable).
// Children are duplicated once for a seamless -50% loop; pass the
// same items twice is NOT needed — duplication is internal.
"use client";

import type { CSSProperties, ReactNode } from "react";

export function Marquee({
  children,
  duration = 32,
  className = "",
}: {
  children: ReactNode;
  /** One full loop in seconds (default 32). */
  duration?: number;
  className?: string;
}) {
  const style = {
    "--duration-marquee": `${duration}s`,
  } as CSSProperties;
  return (
    <div className={`px-marquee ${className}`} style={style} aria-hidden={false}>
      <div className="px-marquee-track">
        <span style={{ display: "contents" }}>{children}</span>
        <span style={{ display: "contents" }} aria-hidden="true">
          {children}
        </span>
      </div>
    </div>
  );
}
