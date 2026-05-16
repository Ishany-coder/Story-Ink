"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Occasion, RecipientType, StoryDraft } from "@/lib/types";

const TOTAL_STEPS = 7;

const STEP_LABELS = [
  "Recipient",
  "Occasion",
  "Cast",
  "Outline",
  "Style",
  "Length",
  "Review",
];

const RECIPIENT_LABELS: Record<RecipientType, string> = {
  child: "Child",
  baby: "Baby",
  partner: "Partner",
  parent: "Parent",
  niece_nephew: "Niece / nephew",
  sibling: "Sibling",
  friend: "Friend",
  grandparent: "Grandparent",
  pet: "Pet",
  aunt: "Aunt",
  uncle: "Uncle",
  cousin: "Cousin",
  family: "Family",
  self: "Self",
  other: "Other",
};

const OCCASION_LABELS: Record<Occasion, string> = {
  birthday: "Birthday",
  anniversary: "Anniversary",
  memorial: "Memorial",
  just_because: "Just because",
  graduation: "Graduation",
  holiday: "Holiday",
  new_baby: "New baby",
  achievement: "Achievement",
};

// Pick a soft gradient deterministically from the draft id so each
// card has its own quiet character without the user having to set one.
const FALLBACK_GRADIENTS = [
  "from-cream-200 via-cream-100 to-cream-50",
  "from-moss-100 via-cream-100 to-cream-50",
  "from-gold-100 via-cream-100 to-cream-50",
  "from-cream-300 via-cream-200 to-cream-100",
  "from-moss-200/40 via-cream-100 to-cream-50",
];

function gradientFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash + seed.charCodeAt(i)) | 0;
  return FALLBACK_GRADIENTS[Math.abs(hash) % FALLBACK_GRADIENTS.length];
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return "just now";
  if (diff < hour) return `${Math.floor(diff / minute)}m ago`;
  if (diff < day) return `${Math.floor(diff / hour)}h ago`;
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export default function ResumeDraftCard({ draft }: { draft: StoryDraft }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  const step = Math.min(Math.max(draft.current_step, 1), TOTAL_STEPS);
  const stepLabel = STEP_LABELS[step - 1] ?? "";
  const percent = Math.round((step / TOTAL_STEPS) * 100);

  const p = draft.payload ?? {};
  const recipient = p.recipientType
    ? RECIPIENT_LABELS[p.recipientType]
    : null;
  const occasion = p.occasion ? OCCASION_LABELS[p.occasion] : null;
  const pageCount = p.pageCount;
  const castCount = p.castCharacterIds?.length ?? 0;
  const outline = (p.outline ?? "").trim();

  const title =
    (draft.title && draft.title.trim().length > 0
      ? draft.title.trim()
      : "Untitled draft");

  const gradient = gradientFor(draft.id);

  async function handleDelete(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (deleting) return;
    const ok = window.confirm(
      `Discard "${title}"? Your progress on this draft will be lost.`
    );
    if (!ok) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/drafts/${draft.id}`, { method: "DELETE" });
      if (!res.ok) {
        window.alert("Couldn't delete the draft. Please try again.");
        setDeleting(false);
        return;
      }
      router.refresh();
    } catch {
      window.alert("Couldn't delete the draft. Please try again.");
      setDeleting(false);
    }
  }

  return (
    <div
      className={`group relative transition-opacity ${
        deleting ? "pointer-events-none opacity-50" : ""
      }`}
    >
      <Link
        href={`/create/new?draft=${draft.id}`}
        className="flex h-full flex-col overflow-hidden rounded-2xl border border-cream-300 bg-cream-50 shadow-[0_1px_2px_rgba(14,26,43,0.04)] transition-all duration-300 hover:-translate-y-1 hover:border-gold-500 hover:shadow-[0_12px_32px_rgba(14,26,43,0.10)]"
      >
        {/* Top visual strip — a tonal sketch placeholder. Drafts don't
            have a cover yet; this stands in for one and gives each card
            a quiet personality based on the draft id. */}
        <div
          className={`relative h-24 overflow-hidden bg-gradient-to-br ${gradient}`}
        >
          <SketchPattern />
          <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full border border-cream-300/80 bg-cream-50/90 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-500 shadow-sm backdrop-blur-sm">
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 rounded-full bg-gold-500"
            />
            Draft
          </span>
          <span className="absolute right-3 top-3 rounded-full border border-cream-300/80 bg-cream-50/90 px-2.5 py-1 text-[11px] font-medium text-ink-500 shadow-sm backdrop-blur-sm">
            {percent}%
          </span>
        </div>

        <div className="flex flex-1 flex-col gap-3 p-4">
          <div>
            <h3 className="font-[family-name:var(--font-display)] text-lg font-semibold leading-snug text-ink-900 line-clamp-2">
              {title}
            </h3>
            {(recipient || occasion || pageCount) && (
              <p className="mt-1 text-xs font-medium text-ink-500">
                {[recipient, occasion, pageCount ? `${pageCount} pages` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
          </div>

          <p className="text-sm leading-relaxed text-ink-500 line-clamp-2">
            {outline.length > 0
              ? outline
              : "No outline yet — pick up where you left off."}
          </p>

          {castCount > 0 && (
            <div className="-mt-1 inline-flex w-fit items-center gap-1.5 rounded-full bg-moss-100 px-2.5 py-1 text-[11px] font-semibold text-moss-700">
              <CastIcon />
              {castCount} {castCount === 1 ? "character" : "characters"}
            </div>
          )}

          {/* Step progress. Seven pills that fill in as the user moves
              through the wizard — easier to read at a glance than a
              percentage and they line up with the actual step labels. */}
          <div className="mt-auto pt-1">
            <div className="flex items-center justify-between text-[11px] font-medium text-ink-500">
              <span>
                Step {step} of {TOTAL_STEPS} ·{" "}
                <span className="text-ink-700">{stepLabel}</span>
              </span>
            </div>
            <div className="mt-1.5 flex gap-1">
              {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
                <span
                  key={i}
                  aria-hidden="true"
                  className={`h-1.5 flex-1 rounded-full transition-colors ${
                    i < step ? "bg-moss-500" : "bg-cream-300"
                  }`}
                />
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 pt-1 text-xs text-ink-300">
            <span>Updated {formatRelative(draft.updated_at)}</span>
            <span className="inline-flex items-center gap-1 font-semibold text-moss-700 transition-colors group-hover:text-ink-900">
              Continue
              <ArrowIcon />
            </span>
          </div>
        </div>
      </Link>

      <button
        type="button"
        onClick={handleDelete}
        disabled={deleting}
        aria-label={`Delete draft ${title}`}
        className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-cream-300 bg-cream-50/95 text-ink-500 opacity-0 shadow-sm transition-all hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600 focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 group-hover:opacity-100"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-3.5 w-3.5"
          aria-hidden="true"
        >
          <path d="M3 6h18" />
          <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
        </svg>
      </button>
    </div>
  );
}

function SketchPattern() {
  // Decorative dotted-line sketch — visually communicates "in progress
  // / not yet inked" without needing real artwork. Subtle enough that
  // the gradient still does most of the visual work.
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 200 96"
      preserveAspectRatio="xMidYMid slice"
      className="absolute inset-0 h-full w-full text-ink-300/40"
    >
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeDasharray="3 5"
      >
        <path d="M16 70 Q 60 30 100 60 T 184 50" />
        <path d="M28 80 Q 80 50 130 72 T 188 64" />
      </g>
      <g fill="currentColor" className="text-ink-300/30">
        <circle cx="36" cy="32" r="2" />
        <circle cx="160" cy="22" r="2" />
        <circle cx="112" cy="18" r="1.5" />
      </g>
    </svg>
  );
}

function CastIcon() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="transition-transform group-hover:translate-x-0.5"
    >
      <path d="M5 12h14" />
      <path d="M13 5l7 7-7 7" />
    </svg>
  );
}
