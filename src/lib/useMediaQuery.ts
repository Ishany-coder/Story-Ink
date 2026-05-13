"use client";

import { useSyncExternalStore } from "react";

// SSR-safe media query hook.
//
// `useSyncExternalStore` reads the current value via a snapshot — no
// `useState` + `useEffect` shuffle, so no setState-in-effect lint
// trigger and no flash of stale state after hydration. The server
// snapshot returns `true` by default so SSR matches the desktop
// rendering path (we don't ship a phone-sized fallback in the
// server HTML); the client snapshot updates on the next paint with
// the real `matchMedia` result.
//
// The subscriber listens via `addEventListener("change", …)` on the
// MediaQueryList; the cleanup removes it. Older Safari only
// implements `addListener`, but we target evergreen browsers.

function subscribe(query: string): (cb: () => void) => () => void {
  return (cb: () => void) => {
    if (typeof window === "undefined") return () => {};
    const mql = window.matchMedia(query);
    mql.addEventListener("change", cb);
    return () => mql.removeEventListener("change", cb);
  };
}

function getSnapshot(query: string): () => boolean {
  return () => {
    if (typeof window === "undefined") return true;
    return window.matchMedia(query).matches;
  };
}

function getServerSnapshot(): boolean {
  // Default to `true` on the server. Callers that gate a desktop-only
  // shell on `useMediaQuery("(min-width: 768px)")` get the desktop
  // shell in SSR HTML, and the client unmounts it on hydration if
  // the viewport is actually below md.
  return true;
}

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    subscribe(query),
    getSnapshot(query),
    getServerSnapshot
  );
}
