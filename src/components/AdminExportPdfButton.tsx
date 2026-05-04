"use client";

import { useState } from "react";
import { Download } from "lucide-react";

// Floating admin-only export control on the reader. Two buttons:
// Interior + Cover, each hits /api/admin/stories/[id]/export-pdf and
// streams a download. We trigger the download by setting
// window.location to the URL — the route returns
// Content-Disposition: attachment so the browser saves it directly
// rather than navigating.

export default function AdminExportPdfButton({
  storyId,
}: {
  storyId: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<"interior" | "cover" | null>(null);

  function download(kind: "interior" | "cover") {
    if (pending) return;
    setPending(kind);
    // Hidden iframe → triggers the browser download without leaving
    // the current page. setTimeout clears pending after a beat so the
    // button doesn't stay disabled forever if the response is slow.
    const iframe = document.createElement("iframe");
    iframe.style.display = "none";
    iframe.src = `/api/admin/stories/${storyId}/export-pdf?type=${kind}`;
    document.body.appendChild(iframe);
    setTimeout(() => {
      setPending(null);
      iframe.remove();
    }, 60_000);
  }

  return (
    <div className="fixed right-5 top-20 z-40 flex flex-col items-end gap-2">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          title="Export PDF (admin)"
          className="inline-flex items-center gap-2 rounded-full bg-ink-900/90 px-4 py-2 text-xs font-semibold text-cream-50 shadow-lg backdrop-blur-md transition-colors hover:bg-ink-900"
        >
          <Download className="h-3.5 w-3.5" />
          Export PDF
        </button>
      ) : (
        <div className="flex flex-col gap-2 rounded-2xl border border-cream-300 bg-cream-50/95 p-3 shadow-lg backdrop-blur-md">
          <span className="px-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-300">
            Lulu print files
          </span>
          <button
            type="button"
            onClick={() => download("interior")}
            disabled={pending !== null}
            className="inline-flex items-center justify-between gap-2 rounded-full bg-moss-700 px-4 py-2 text-xs font-semibold text-cream-50 transition-colors hover:bg-moss-900 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span>{pending === "interior" ? "Building…" : "Interior PDF"}</span>
            <Download className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => download("cover")}
            disabled={pending !== null}
            className="inline-flex items-center justify-between gap-2 rounded-full border border-cream-300 bg-cream-50 px-4 py-2 text-xs font-semibold text-ink-700 transition-colors hover:bg-cream-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span>{pending === "cover" ? "Building…" : "Cover PDF"}</span>
            <Download className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="px-1 text-[10px] font-medium text-ink-300 hover:text-ink-700"
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
}
