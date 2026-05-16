import Link from "next/link";
import type { StoryDraft } from "@/lib/types";

const STEP_LABELS = [
  "Step 1 · Recipient",
  "Step 2 · Occasion",
  "Step 3 · Cast",
  "Step 4 · Outline",
  "Step 5 · Style",
  "Step 6 · Length",
  "Step 7 · Review",
];

export default function ResumeDraftCard({ draft }: { draft: StoryDraft }) {
  const stepLabel = STEP_LABELS[Math.max(0, draft.current_step - 1)] ?? "";
  return (
    <Link
      href={`/create/new?draft=${draft.id}`}
      className="block border rounded-lg p-4 bg-white hover:shadow-sm"
    >
      <div className="font-medium">{draft.title ?? "Draft"}</div>
      <div className="text-sm text-stone-500">{stepLabel}</div>
      <div className="text-xs text-stone-400 mt-1">
        Updated {new Date(draft.updated_at).toLocaleDateString()}
      </div>
    </Link>
  );
}
