// Persists a small palette of recently-used colors to localStorage so the
// user's color picks accumulate across sessions. Capped at 16 entries.

const STORAGE_KEY = "storyink.studio.recentColors";
const MAX = 16;

function safeRead(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((s): s is string => typeof s === "string").slice(0, MAX);
  } catch {
    return [];
  }
}

function safeWrite(values: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
  } catch {
    // localStorage may throw in private mode / over quota — silent skip
    // is fine, the in-memory state still works for the current session.
  }
}

export function getRecentColors(): string[] {
  return safeRead();
}

export function recordRecentColor(color: string): string[] {
  if (!color) return safeRead();
  const norm = color.toLowerCase();
  // Skip "transparent" — it's not a memorable hue and the picker has its
  // own "None" affordance for clearing fills.
  if (norm === "transparent") return safeRead();
  const current = safeRead();
  const next = [norm, ...current.filter((c) => c.toLowerCase() !== norm)].slice(
    0,
    MAX
  );
  safeWrite(next);
  return next;
}

export function clearRecentColors() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Same fail-soft logic as record / read.
  }
}
