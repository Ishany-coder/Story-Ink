"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import AccountDeleteModal from "@/components/AccountDeleteModal";

export default function AccountActions() {
  const router = useRouter();
  const [exporting, setExporting] = useState(false);
  const [exportErr, setExportErr] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  async function handleExport() {
    setExporting(true);
    setExportErr(null);
    try {
      const res = await fetch("/api/account/export", { method: "POST" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Export failed (${res.status})`);
      }
      // Trigger a real download via a temporary anchor.
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const date = new Date().toISOString().slice(0, 10);
      a.download = `storyink-export-${date}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportErr(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  async function handleDelete() {
    const res = await fetch("/api/account", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: "DELETE" }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error || `Delete failed (${res.status})`);
    }
    // Account is gone — bounce to the home page.
    router.push("/");
    router.refresh();
  }

  return (
    <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <button
        type="button"
        onClick={handleExport}
        disabled={exporting}
        className="rounded-full bg-moss-700 px-5 py-2 text-sm font-semibold text-cream-50 shadow-sm transition-colors hover:bg-moss-900 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {exporting ? "Preparing…" : "Export my data"}
      </button>
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className="rounded-full border border-rose-300 px-5 py-2 text-sm font-semibold text-rose-700 transition-colors hover:bg-rose-50"
      >
        Delete my account
      </button>
      {exportErr && (
        <p className="text-xs font-medium text-rose-600 sm:basis-full">
          {exportErr}
        </p>
      )}
      <AccountDeleteModal
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
