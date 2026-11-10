// Demo login gate — client-side only. There is NO real authentication
// here: a single demo merchant flag in localStorage. No server session,
// no API changes, no middleware. Another agent's landing page uses this
// exact API — keep the exports and the localStorage key stable.
"use client";

import { useCallback, useEffect, useState } from "react";

/** localStorage key; value is AUTH_VALUE while logged in. */
export const AUTH_KEY = "phalanx-auth";
export const AUTH_VALUE = "demo-merchant";

/** The single demo merchant. Shown on the login page. */
export const DEMO_EMAIL = "demo@phalanx.krynex.in";
export const DEMO_PASSWORD = "phalanx-demo";

export const LOGIN_FAILURE_MESSAGE =
  "Those demo credentials don't match — try demo@phalanx.krynex.in / phalanx-demo";

/** Pure credential match: exact demo password, email trimmed and
 *  case-insensitive. No hashing, no server — this is a demo gate. */
export function isDemoLogin(email: string, password: string): boolean {
  return email.trim().toLowerCase() === DEMO_EMAIL && password === DEMO_PASSWORD;
}

/** Fired on this tab whenever login()/logout() runs, so separate
 *  useAuth() instances (navbar, AuthGate, login page) stay in sync —
 *  the "storage" event only fires in *other* tabs. */
const AUTH_EVENT = "phalanx-auth-change";

function readAuthed(): boolean {
  try {
    return window.localStorage.getItem(AUTH_KEY) === AUTH_VALUE;
  } catch {
    return false;
  }
}

export function useAuth(): {
  authed: boolean;
  login: (email: string, password: string) => boolean;
  logout: () => void;
} {
  // SSR-safe: default false on first render so server HTML is
  // deterministic; the real flag is read after mount.
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    setAuthed(readAuthed());
    const sync = () => setAuthed(readAuthed());
    window.addEventListener("storage", sync);
    window.addEventListener(AUTH_EVENT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(AUTH_EVENT, sync);
    };
  }, []);

  const login = useCallback((email: string, password: string): boolean => {
    if (!isDemoLogin(email, password)) return false;
    try {
      window.localStorage.setItem(AUTH_KEY, AUTH_VALUE);
    } catch {
      // Storage unavailable — still treat the in-memory login as valid
      // for this tab so the demo is usable.
    }
    setAuthed(true);
    window.dispatchEvent(new Event(AUTH_EVENT));
    return true;
  }, []);

  const logout = useCallback(() => {
    try {
      window.localStorage.removeItem(AUTH_KEY);
    } catch {
      /* storage unavailable — the in-memory flag still clears */
    }
    setAuthed(false);
    window.dispatchEvent(new Event(AUTH_EVENT));
  }, []);

  return { authed, login, logout };
}
