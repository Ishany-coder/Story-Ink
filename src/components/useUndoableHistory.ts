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
//
// The hook only stores the `pages` slice — that's all that
// undo/redo affects in the Studio. Story-level fields like
// library_images and ai_system_prompt change via separate flows
// that aren't part of canvas editing.

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

  const undo = useCallback(
    (currentPages: StoryPage[]): StoryPage[] | null => {
      let popped: StoryPage[] | null = null;
      setPast((p) => {
        if (p.length === 0) return p;
        popped = p[p.length - 1];
        return p.slice(0, -1);
      });
      if (!popped) return null;
      setFuture((f) => {
        const next = [...f, currentPages];
        if (next.length > maxSize) next.splice(0, next.length - maxSize);
        return next;
      });
      // Reset dedupe ref so the next snapshot doesn't get treated
      // as a no-op against the popped pointer.
      lastSnappedRef.current = popped;
      return popped;
    },
    [maxSize]
  );

  const redo = useCallback(
    (currentPages: StoryPage[]): StoryPage[] | null => {
      let popped: StoryPage[] | null = null;
      setFuture((f) => {
        if (f.length === 0) return f;
        popped = f[f.length - 1];
        return f.slice(0, -1);
      });
      if (!popped) return null;
      setPast((p) => {
        const next = [...p, currentPages];
        if (next.length > maxSize) next.splice(0, next.length - maxSize);
        return next;
      });
      lastSnappedRef.current = popped;
      return popped;
    },
    [maxSize]
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
