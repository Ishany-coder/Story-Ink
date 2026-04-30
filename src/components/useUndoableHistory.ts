"use client";

import { useCallback, useRef, useState } from "react";

// Tiny undo/redo machine for the Studio.
//
// Design choice — we DON'T wrap the whole story state in this hook,
// because dragging a layer fires `setStory` ~60×/sec. Wrapping it
// would mean either snapshotting every frame (spammy past stack,
// undo only undoes one frame of motion) or tracking edit sessions
// inside the hook (complicated and brittle).
//
// Instead: keep the existing `useState<Story>` for live edits, and
// expose snapshot/undo/redo here for the caller to wire into
// user-action boundaries. The caller calls `snapshot(currentPages)`
// before each atomic mutation OR at the start of a continuous edit
// session (drag, text typing). The result is one undo step per
// logical user action, regardless of how many state updates happen
// inside it.

import type { StoryPage } from "@/lib/types";

interface Options {
  // Cap on past + future stack length combined. Default 50 keeps
  // memory reasonable while still letting users back out of any
  // realistic editing session.
  maxSize?: number;
}

export interface UndoableHistory {
  past: StoryPage[][];
  future: StoryPage[][];
  canUndo: boolean;
  canRedo: boolean;

  // Capture the supplied pages array as the "before" state for the
  // next mutation. Idempotent within a single user action — calling
  // it twice in a row with the same array ref is a no-op so callers
  // can defensively snapshot at multiple entry points without
  // creating dupes.
  snapshot: (pages: StoryPage[]) => void;

  // Undo / redo: returns the pages array the caller should swap
  // into story state, or null if there's nothing to do.
  undo: (currentPages: StoryPage[]) => StoryPage[] | null;
  redo: (currentPages: StoryPage[]) => StoryPage[] | null;

  // Wipe history (e.g. when the user navigates to a different
  // story). Not used today but kept for future routing changes.
  reset: () => void;
}

export function useUndoableHistory({
  maxSize = 50,
}: Options = {}): UndoableHistory {
  const [past, setPast] = useState<StoryPage[][]>([]);
  const [future, setFuture] = useState<StoryPage[][]>([]);
  // Tracks the most recent snapshotted ref so we can dedupe rapid
  // duplicate snapshot() calls within the same logical action.
  const lastSnappedRef = useRef<StoryPage[] | null>(null);

  const snapshot = useCallback(
    (pages: StoryPage[]) => {
      if (lastSnappedRef.current === pages) return;
      lastSnappedRef.current = pages;
      setPast((p) => {
        const next = [...p, pages];
        // Keep most recent maxSize entries.
        if (next.length > maxSize) next.splice(0, next.length - maxSize);
        return next;
      });
      setFuture([]);
    },
    [maxSize]
  );

  // IMPORTANT: read past/future from closure, not from inside a
  // setState callback. React's setState updaters run lazily during
  // reconciliation, so any value you pull out of `(p) => {...}` is
  // unavailable in the synchronous code that follows the setState
  // call. The first version of this hook had that bug — undo always
  // returned null because the popped value was assigned during the
  // next render, after the function had already returned.
  const undo = useCallback(
    (currentPages: StoryPage[]): StoryPage[] | null => {
      if (past.length === 0) return null;
      const popped = past[past.length - 1];
      setPast(past.slice(0, -1));
      setFuture((f) => {
        const next = [...f, currentPages];
        if (next.length > maxSize) next.splice(0, next.length - maxSize);
        return next;
      });
      // Reset dedupe ref so the next snapshot() doesn't get treated
      // as a no-op against the popped pointer.
      lastSnappedRef.current = popped;
      return popped;
    },
    [past, maxSize]
  );

  const redo = useCallback(
    (currentPages: StoryPage[]): StoryPage[] | null => {
      if (future.length === 0) return null;
      const popped = future[future.length - 1];
      setFuture(future.slice(0, -1));
      setPast((p) => {
        const next = [...p, currentPages];
        if (next.length > maxSize) next.splice(0, next.length - maxSize);
        return next;
      });
      lastSnappedRef.current = popped;
      return popped;
    },
    [future, maxSize]
  );

  const reset = useCallback(() => {
    setPast([]);
    setFuture([]);
    lastSnappedRef.current = null;
  }, []);

  return {
    past,
    future,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    snapshot,
    undo,
    redo,
    reset,
  };
}
