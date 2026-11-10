// Shared micro-interaction hooks (production-ready build, Nov 11, 2026).
// CSS-first: these hooks only position a sliding nav pill and feed cursor
// coordinates into --mouse-x/--mouse-y for the spotlight effect. All
// visuals live in globals.css. Both hooks are no-ops when the relevant
// elements are absent, and they clean up their listeners on unmount.

import { useEffect, type RefObject } from "react";

/** Cursor-tracking spotlight: sets --mouse-x/--mouse-y on the hovered
 *  `.spotlight` element so its radial highlight follows the cursor. */
export function useSpotlight(): void {
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const target = (e.target as HTMLElement | null)?.closest?.(
        ".spotlight",
      ) as HTMLElement | null;
      if (!target) return;
      const rect = target.getBoundingClientRect();
      target.style.setProperty("--mouse-x", `${e.clientX - rect.left}px`);
      target.style.setProperty("--mouse-y", `${e.clientY - rect.top}px`);
    };
    document.addEventListener("mousemove", onMove, { passive: true });
    return () => document.removeEventListener("mousemove", onMove);
  }, []);
}

/** Sliding pill navigation: glides one shared `.nav-pill` background
 *  under the hovered (or active) `.nav-link` inside the referenced nav.
 *  Falls back silently (pill stays hidden) if no links are present.
 *  Tolerates late-mounted navs (e.g. detail page renders its nav only
 *  after the dispute loads) via a MutationObserver. */
export function useNavPill(
  navRef: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    let cleanup: (() => void) | null = null;
    let observer: MutationObserver | null = null;

    const tryInit = () => {
      const nav = navRef.current;
      if (!nav || cleanup) return;
      const pill = nav.querySelector<HTMLElement>(".nav-pill");
      if (!pill) return;

      const moveTo = (el: HTMLElement | null) => {
        if (!el) {
          pill.style.opacity = "0";
          return;
        }
        const rect = el.getBoundingClientRect();
        const navRect = nav.getBoundingClientRect();
        pill.style.opacity = "1";
        pill.style.width = `${rect.width}px`;
        pill.style.transform = `translate(${rect.left - navRect.left}px, -50%)`;
      };
      const activeLink = () =>
        nav.querySelector<HTMLElement>(".nav-link.active") ??
        nav.querySelector<HTMLElement>(".nav-link");
      moveTo(activeLink());

      const onMove = (e: MouseEvent) => {
        const link = (e.target as HTMLElement | null)?.closest?.(".nav-link");
        if (link && nav.contains(link)) moveTo(link as HTMLElement);
      };
      const onLeave = () => moveTo(activeLink());
      const onResize = () => moveTo(activeLink());
      nav.addEventListener("mousemove", onMove);
      nav.addEventListener("mouseleave", onLeave);
      window.addEventListener("resize", onResize);
      cleanup = () => {
        nav.removeEventListener("mousemove", onMove);
        nav.removeEventListener("mouseleave", onLeave);
        window.removeEventListener("resize", onResize);
      };
      observer?.disconnect();
      observer = null;
    };

    tryInit();
    if (!cleanup) {
      observer = new MutationObserver(() => tryInit());
      observer.observe(document.body, { childList: true, subtree: true });
    }
    return () => {
      observer?.disconnect();
      cleanup?.();
    };
  }, [navRef]);
}
