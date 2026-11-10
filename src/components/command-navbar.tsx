// Sticky glass command navbar (Gemini directive §3.1) — replaces the
// old command-bar. Brand mark + v2.4 tag, sliding-pill nav (Command
// Queue | Swarm Architecture | Evidence Vault | Webhook & Audit Log),
// live mode pill, Sync PayPal Disputes button, and a Public Access Soon
// pill whose popover captures an invite email FRONT-END ONLY (persisted
// to localStorage; there is NO server-side waitlist/invite storage).
"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useNavPill, useSpotlight } from "@/lib/ui-effects";

const INVITE_KEY = "phalanx-invite-email";

function ShieldMark() {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 26 26"
      aria-hidden="true"
      className="phx-brand-mark"
    >
      <path
        d="M13 1.5 23 5.5v7c0 6.2-4.2 10.6-10 12-5.8-1.4-10-5.8-10-12v-7L13 1.5Z"
        fill="#09090B"
      />
      <path
        d="M13 6.2 18.5 8.4v4.3c0 3.4-2.3 5.9-5.5 6.7-3.2-.8-5.5-3.3-5.5-6.7V8.4L13 6.2Z"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="1.1"
      />
      <path
        d="M13 9.2v7M9.8 12.4h6.4"
        stroke="#10B981"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function InvitePopover() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [storedEmail, setStoredEmail] = useState<string | null>(null);

  useEffect(() => {
    try {
      setStoredEmail(window.localStorage.getItem(INVITE_KEY));
    } catch {
      setStoredEmail(null);
    }
  }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = email.trim();
    if (!clean || !clean.includes("@")) return;
    try {
      window.localStorage.setItem(INVITE_KEY, clean);
    } catch {
      /* storage unavailable — the reserved state still shows */
    }
    setStoredEmail(clean);
  };

  return (
    <div
      className="phx-invite-wrap"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className={`phx-invite-pill${storedEmail ? " reserved" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title="Single-tenant engine — public multi-merchant access opening soon"
      >
        {storedEmail ? (
          <>
            <span className="phx-invite-check" aria-hidden="true">
              ✓
            </span>
            Invite Reserved
          </>
        ) : (
          "Public Access Soon"
        )}
      </button>
      {open && (
        <div className="phx-invite-popover" role="dialog" aria-label="Request invite">
          <p className="phx-invite-popover-text">
            Single-Tenant Merchant Deployment · Multi-Merchant Cloud Opening
            Soon
          </p>
          {storedEmail ? (
            <p className="phx-invite-reserved">
              ✓ Invite reserved for {storedEmail} (stored in this browser
              only — no server-side waitlist yet).
            </p>
          ) : (
            <form onSubmit={submit} className="phx-invite-form">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Work email for early access"
                aria-label="Email for early access"
                className="phx-invite-input"
              />
              <button type="submit" className="primary phx-invite-submit">
                Request Invite
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

export default function CommandNavbar({
  envMode,
  simulatedCount,
  onSync,
  syncing,
  evidenceHref,
  active = "queue",
}: {
  envMode: "sandbox" | "seeded";
  simulatedCount: number;
  onSync?: () => void;
  syncing?: boolean;
  evidenceHref: string;
  active?: "queue" | "swarm" | "evidence" | "audit";
}) {
  const navRef = useRef<HTMLElement | null>(null);
  useNavPill(navRef);
  useSpotlight();

  const tabs = [
    { key: "queue", href: "/#queue", label: "Command Queue" },
    { key: "swarm", href: "/#swarm", label: "Swarm Architecture" },
    { key: "evidence", href: evidenceHref, label: "Evidence Vault" },
    { key: "audit", href: "/#audit", label: "Webhook & Audit Log" },
  ] as const;

  return (
    <div className="phx-nav-wrap">
      <header className="phx-nav">
        <div className="phx-brand-cluster">
          <Link href="/" className="phx-brand">
            <ShieldMark />
            <span className="phx-brand-name">PHALANX</span>
          </Link>
          <span className="phx-version-tag font-mono">
            v2.4 DETERMINISTIC ENGINE
          </span>
          <span
            className={`phx-mode-pill ${envMode === "sandbox" ? "live" : "seeded"}`}
            title={
              envMode === "sandbox"
                ? "A live PayPal Sandbox dispute is loaded"
                : "Only seeded (SIMULATED) demo disputes are loaded"
            }
          >
            <span className="phx-mode-dot" aria-hidden="true" />
            {envMode === "sandbox"
              ? "PAYPAL SANDBOX CONNECTED"
              : "SIMULATED SEED MODE"}
          </span>
          {simulatedCount > 0 && (
            <span className="chip sim phx-sim-count">
              {simulatedCount} SIMULATED CASE{simulatedCount === 1 ? "" : "S"}
            </span>
          )}
        </div>

        <nav
          className="nav-links phx-nav-links"
          aria-label="Primary navigation"
          ref={navRef}
        >
          <span className="nav-pill" aria-hidden="true" />
          {tabs.map((t) => (
            <Link
              key={t.key}
              href={t.href}
              className={`nav-link${active === t.key ? " active" : ""}`}
            >
              {t.label}
            </Link>
          ))}
        </nav>

        <div className="phx-nav-actions">
          <button
            type="button"
            className="phx-sync-btn"
            onClick={onSync}
            disabled={syncing || !onSync}
            title="Fetch live disputes from the PayPal Sandbox API"
          >
            <span
              className={`phx-sync-icon${syncing ? " spinning" : ""}`}
              aria-hidden="true"
            >
              ↻
            </span>
            Sync PayPal Disputes
          </button>
          <InvitePopover />
        </div>
      </header>
    </div>
  );
}
