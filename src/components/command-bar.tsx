// Sticky glass command bar — replaces the old floating pill nav.
// Backdrop blur(16px), rgba(255,255,255,0.82), bottom hairline. The
// Environment Pill reflects REAL state only: SANDBOX LIVE appears only
// when a sandbox-source dispute is actually loaded; otherwise the bar
// shows SIMULATED SEED MODE.
// The "Single-Tenant Engine · Public Multi-Merchant Access Opening Soon"
// status pill carries a hover-expandable Join Waitlist micro-input
// (directive Section 3.2). Submitting stores the email in localStorage
// only — there is NO server-side waitlist storage; it is a front-end
// teaser, and the input morphs to a checkmark once stored.
"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavPill, useSpotlight } from "@/lib/ui-effects";

const WAITLIST_KEY = "phalanx-waitlist-email";

function WaitlistPill() {
  const [storedEmail, setStoredEmail] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    try {
      setStoredEmail(window.localStorage.getItem(WAITLIST_KEY));
    } catch {
      setStoredEmail(null);
    }
  }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) return;
    try {
      window.localStorage.setItem(WAITLIST_KEY, clean);
    } catch {
      /* storage unavailable — still show the checkmark for this session */
    }
    setStoredEmail(clean);
  };

  if (!mounted) {
    return (
      <span className="waitlist-pill" title="Single-tenant engine — public multi-merchant access opening soon">
        <span className="waitlist-text">
          Single-Tenant Engine · Public Multi-Merchant Access Opening Soon
        </span>
      </span>
    );
  }

  if (storedEmail) {
    return (
      <span
        className="waitlist-pill joined"
        title={`Early access requested for ${storedEmail} (stored in this browser only — no server-side waitlist yet)`}
      >
        <span className="waitlist-check" aria-hidden="true">
          ✓
        </span>
        <span className="waitlist-text">You&apos;re on the early-access list</span>
      </span>
    );
  }

  return (
    <form className="waitlist-pill" onSubmit={submit}>
      <span className="waitlist-text">
        Single-Tenant Engine · Public Multi-Merchant Access Opening Soon
      </span>
      <span className="waitlist-expand">
        <input
          type="email"
          className="waitlist-input"
          placeholder="Work email for early access"
          aria-label="Email for early access"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <button type="submit" className="waitlist-submit">
          Join Waitlist →
        </button>
      </span>
    </form>
  );
}

export interface CommandBarLink {
  href: string;
  label: string;
  active?: boolean;
}

export default function CommandBar({
  envMode,
  links,
  actions,
  navExtra,
  brandChip = "PayPal Sandbox",
}: {
  envMode: "sandbox" | "seeded";
  links: CommandBarLink[];
  actions?: ReactNode;
  /** Extra .nav-link elements (e.g. dashboard tab buttons) rendered
   *  inside the sliding-pill nav, after the links. */
  navExtra?: ReactNode;
  brandChip?: string;
}) {
  const navRef = useRef<HTMLElement | null>(null);
  useNavPill(navRef);
  useSpotlight();

  return (
    <div className="command-bar-wrap">
      <header className="command-bar">
        <div className="brand-cluster">
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="brand-mark">P</span>
            <span style={{ fontWeight: 700 }}>PHALANX</span>
          </Link>
          <span className="chip obsidian">{brandChip}</span>
          <span
            className={`env-pill ${envMode === "sandbox" ? "live" : "seeded"}`}
            title={
              envMode === "sandbox"
                ? "A live PayPal Sandbox dispute is loaded"
                : "Only seeded (SIMULATED) demo disputes are loaded"
            }
          >
            <span className="env-dot" />
            {envMode === "sandbox" ? "SANDBOX LIVE" : "SIMULATED SEED MODE"}
          </span>
          <WaitlistPill />
        </div>

        <nav className="nav-links" aria-label="Primary navigation" ref={navRef}>
          <span className="nav-pill" aria-hidden="true" />
          {links.map((l) => (
            <Link
              key={l.href + l.label}
              href={l.href}
              className={`nav-link${l.active ? " active" : ""}`}
            >
              {l.label}
            </Link>
          ))}
          {navExtra}
        </nav>

        {actions ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {actions}
          </div>
        ) : null}
      </header>
    </div>
  );
}
