"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CANVAS_SIZE,
  type ImageLayer,
  type Layer,
  type ShapeKind,
  type ShapeLayer,
  type Story,
  type TextLayer,
} from "@/lib/types";
import {
  DEFAULT_LAYOUT_ID,
  LAYOUTS,
  getLayout,
  morphLayersToLayout,
  resolveDisplayLayers,
} from "@/lib/layouts";
import { useAutoFitFontSize } from "./useAutoFitFontSize";
import ShapeRenderer from "./ShapeRenderer";
import { ICONS, ICON_CATEGORIES, getIcon } from "@/lib/shapeIcons";

interface CanvasEditorProps {
  story: Story;
}

type SidebarTab = "layouts" | "text" | "shapes" | "upload";

// Compass points for resize handles. The edge the user grabs determines
// which corner stays anchored and whether width/height grows positive or
// negative relative to the drag delta.
type ResizeEdge = "e" | "w" | "n" | "s" | "se";

type Drag =
  | { kind: "move"; layerId: string; startX: number; startY: number; origX: number; origY: number }
  | {
      kind: "resize";
      edge: ResizeEdge;
      layerId: string;
      startX: number;
      startY: number;
      origX: number;
      origY: number;
      origW: number;
      origH: number;
    }
  | {
      kind: "rotate";
      layerId: string;
      cx: number;
      cy: number;
      startAngle: number;
      origRot: number;
    };

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function makeText(): TextLayer {
  return {
    id: uid(),
    type: "text",
    text: "Double-click to edit",
    x: 240,
    y: 360,
    width: 320,
    height: 80,
    rotation: 0,
    fontSize: 24,
    color: "#1f1147",
    fontFamily: "var(--font-display), serif",
    fontWeight: "bold",
    source: "user",
  };
}

type PrimitiveShape = "rect" | "circle" | "line";

function makePrimitiveShape(shape: PrimitiveShape): ShapeLayer {
  return {
    id: uid(),
    type: "shape",
    shape,
    x: 280,
    y: 280,
    width: 240,
    height: shape === "line" ? 6 : 240,
    rotation: 0,
    fill: shape === "line" ? "transparent" : "#fde68a",
    stroke: "#7c3aed",
    strokeWidth: shape === "line" ? 6 : 4,
    source: "user",
  };
}

function makeIconShape(iconName: string): ShapeLayer {
  return {
    id: uid(),
    type: "shape",
    shape: "icon",
    iconName,
    x: 300,
    y: 300,
    width: 200,
    height: 200,
    rotation: 0,
    // Icons default to stroke-only (Lucide's native style). Users can
    // fill them from the properties panel.
    fill: "transparent",
    stroke: "#7c3aed",
    strokeWidth: 2,
    source: "user",
  };
}

function makePathShape(svgMarkup: string, viewBox: string): ShapeLayer {
  return {
    id: uid(),
    type: "shape",
    shape: "path",
    svgMarkup,
    viewBox,
    x: 300,
    y: 300,
    width: 200,
    height: 200,
    rotation: 0,
    fill: "transparent",
    stroke: "#7c3aed",
    strokeWidth: 1,
    source: "user",
  };
}

// Parse a user-uploaded SVG string into a shape layer.
// Strips <script> elements and on* event-handler attributes so the markup
// is safe to render via dangerouslySetInnerHTML (stored SVGs are displayed
// to other viewers of the story, so this matters).
function parseUploadedSvg(
  svgText: string
): { markup: string; viewBox: string } | null {
  const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
  const svg = doc.querySelector("svg");
  if (!svg) return null;
  if (doc.querySelector("parsererror")) return null;

  // Strip scripts + event handlers recursively.
  svg.querySelectorAll("script").forEach((el) => el.remove());
  const all: Element[] = [svg, ...Array.from(svg.querySelectorAll("*"))];
  for (const el of all) {
    for (const attr of Array.from(el.attributes)) {
      if (attr.name.toLowerCase().startsWith("on")) {
        el.removeAttribute(attr.name);
      }
    }
  }

  const viewBox =
    svg.getAttribute("viewBox") ||
    `0 0 ${svg.getAttribute("width") || 100} ${
      svg.getAttribute("height") || 100
    }`;
  return { markup: svg.innerHTML, viewBox };
}

function makeUploadImage(src: string, width = 300, height = 300): ImageLayer {
  return {
    id: uid(),
    type: "image",
    src,
    x: CANVAS_SIZE / 2 - width / 2,
    y: CANVAS_SIZE / 2 - height / 2,
    width,
    height,
    rotation: 0,
    source: "user",
  };
}

const FONT_FAMILIES = [
  { label: "Display (Fredoka)", value: "var(--font-display), serif" },
  { label: "Sans (Nunito)", value: "var(--font-sans), system-ui, sans-serif" },
  { label: "Serif", value: "Georgia, 'Times New Roman', serif" },
  { label: "Mono", value: "ui-monospace, SFMono-Regular, monospace" },
];

const SWATCHES = [
  "#1f1147",
  "#7c3aed",
  "#ec4899",
  "#f97316",
  "#f59e0b",
  "#10b981",
  "#0ea5e9",
  "#ffffff",
  "#000000",
];

export default function CanvasEditor({ story: initialStory }: CanvasEditorProps) {
  const [story, setStory] = useState<Story>(initialStory);
  const [pageIdx, setPageIdx] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<SidebarTab>("layouts");
  const [drag, setDrag] = useState<Drag | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [dirty, setDirty] = useState<Record<number, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [regenPending, setRegenPending] = useState(false);
  const [shapeSearch, setShapeSearch] = useState("");

  const canvasRef = useRef<HTMLDivElement>(null);

  const currentPage = story.pages[pageIdx];
  const layers: Layer[] = currentPage?.overlays ?? [];
  const selectedLayer = layers.find((l) => l.id === selectedId) ?? null;
  const currentLayoutId = currentPage?.layoutId ?? DEFAULT_LAYOUT_ID;

  // Materialize layout-synthesized layers into real overlays on first view of
  // a page that doesn't have them yet (legacy stories, or pages that somehow
  // never got initial overlays). This makes the layers movable and persistable.
  useEffect(() => {
    if (!currentPage) return;
    const existing = currentPage.overlays ?? [];
    const hasLayoutImage = existing.some(
      (l) => l.source === "layout" && l.type === "image"
    );
    const hasLayoutText = existing.some(
      (l) => l.source === "layout" && l.type === "text"
    );
    if (hasLayoutImage && hasLayoutText) return;

    const resolved = resolveDisplayLayers(currentPage);
    setStory((prev) => ({
      ...prev,
      pages: prev.pages.map((p) =>
        p.pageNumber === currentPage.pageNumber
          ? {
              ...p,
              overlays: resolved,
              layoutId: p.layoutId ?? DEFAULT_LAYOUT_ID,
            }
          : p
      ),
    }));
    setDirty((d) => ({ ...d, [currentPage.pageNumber]: true }));
  }, [currentPage]);

  // ---- Layer mutations -----------------------------------------------------

  const updatePage = useCallback(
    (
      pageNumber: number,
      mutate: (page: NonNullable<typeof currentPage>) => NonNullable<typeof currentPage>
    ) => {
      setStory((prev) => ({
        ...prev,
        pages: prev.pages.map((p) => (p.pageNumber === pageNumber ? mutate(p) : p)),
      }));
      setDirty((d) => ({ ...d, [pageNumber]: true }));
    },
    []
  );

  const updatePageLayers = useCallback(
    (pageNumber: number, mutate: (layers: Layer[]) => Layer[]) => {
      updatePage(pageNumber, (p) => ({ ...p, overlays: mutate(p.overlays ?? []) }));
    },
    [updatePage]
  );

  const addLayer = useCallback(
    (layer: Layer) => {
      if (!currentPage) return;
      updatePageLayers(currentPage.pageNumber, (ls) => [...ls, layer]);
      setSelectedId(layer.id);
    },
    [currentPage, updatePageLayers]
  );

  const updateLayer = useCallback(
    (id: string, patch: Partial<Layer>) => {
      if (!currentPage) return;
      updatePageLayers(currentPage.pageNumber, (ls) =>
        ls.map((l) => (l.id === id ? ({ ...l, ...patch } as Layer) : l))
      );
    },
    [currentPage, updatePageLayers]
  );

  const deleteLayer = useCallback(
    (id: string) => {
      if (!currentPage) return;
      updatePageLayers(currentPage.pageNumber, (ls) =>
        ls.filter((l) => l.id !== id)
      );
      if (selectedId === id) setSelectedId(null);
    },
    [currentPage, selectedId, updatePageLayers]
  );

  const applyLayout = useCallback(
    (layoutId: string) => {
      if (!currentPage) return;
      const layout = getLayout(layoutId);
      updatePage(currentPage.pageNumber, (p) => ({
        ...p,
        layoutId,
        overlays: morphLayersToLayout(p.overlays ?? [], layout),
      }));
    },
    [currentPage, updatePage]
  );

  // Delete key removes selected (when not editing text inline).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (editingTextId) return;
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        const target = e.target as HTMLElement | null;
        if (
          target &&
          (target.tagName === "INPUT" ||
            target.tagName === "TEXTAREA" ||
            target.isContentEditable)
        ) {
          return;
        }
        e.preventDefault();
        deleteLayer(selectedId);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, deleteLayer, editingTextId]);

  // ---- Drag / resize / rotate ---------------------------------------------

  function clientToCanvasScale(): number {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 1;
    return CANVAS_SIZE / rect.width;
  }

  function startMove(e: React.PointerEvent, layer: Layer) {
    e.stopPropagation();
    setSelectedId(layer.id);
    setDrag({
      kind: "move",
      layerId: layer.id,
      startX: e.clientX,
      startY: e.clientY,
      origX: layer.x,
      origY: layer.y,
    });
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }

  function startResize(
    e: React.PointerEvent,
    layer: Layer,
    edge: ResizeEdge
  ) {
    e.stopPropagation();
    setDrag({
      kind: "resize",
      edge,
      layerId: layer.id,
      startX: e.clientX,
      startY: e.clientY,
      origX: layer.x,
      origY: layer.y,
      origW: layer.width,
      origH: layer.height,
    });
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }

  function startRotate(e: React.PointerEvent, layer: Layer) {
    e.stopPropagation();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const scale = CANVAS_SIZE / rect.width;
    const cxClient = rect.left + (layer.x + layer.width / 2) / scale;
    const cyClient = rect.top + (layer.y + layer.height / 2) / scale;
    const startAngle = Math.atan2(e.clientY - cyClient, e.clientX - cxClient);
    setDrag({
      kind: "rotate",
      layerId: layer.id,
      cx: cxClient,
      cy: cyClient,
      startAngle,
      origRot: layer.rotation,
    });
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }

  useEffect(() => {
    if (!drag) return;
    function onMove(e: PointerEvent) {
      if (!drag) return;
      if (drag.kind === "move") {
        const scale = clientToCanvasScale();
        const dx = (e.clientX - drag.startX) * scale;
        const dy = (e.clientY - drag.startY) * scale;
        updateLayer(drag.layerId, {
          x: drag.origX + dx,
          y: drag.origY + dy,
        });
      } else if (drag.kind === "resize") {
        const scale = clientToCanvasScale();
        const dx = (e.clientX - drag.startX) * scale;
        const dy = (e.clientY - drag.startY) * scale;

        let newX = drag.origX;
        let newY = drag.origY;
        let newW = drag.origW;
        let newH = drag.origH;

        // Right / southeast: grow rightward, top-left anchored. Clamp to
        // canvas so the layer can't silently extend past the clip.
        if (drag.edge === "e" || drag.edge === "se") {
          const maxW = CANVAS_SIZE - drag.origX;
          newW = Math.max(20, Math.min(maxW, drag.origW + dx));
        }
        // Bottom / southeast: grow downward, top-left anchored.
        if (drag.edge === "s" || drag.edge === "se") {
          const maxH = CANVAS_SIZE - drag.origY;
          newH = Math.max(20, Math.min(maxH, drag.origH + dy));
        }
        // Left: grow leftward. Width grows by -dx, x shrinks by same.
        // Clamp so x >= 0 (no going past the canvas left edge).
        if (drag.edge === "w") {
          const maxW = drag.origX + drag.origW; // x=0 → width = origRight
          newW = Math.max(20, Math.min(maxW, drag.origW - dx));
          newX = drag.origX + drag.origW - newW;
        }
        // Top: grow upward. Height grows by -dy, y shrinks.
        if (drag.edge === "n") {
          const maxH = drag.origY + drag.origH;
          newH = Math.max(20, Math.min(maxH, drag.origH - dy));
          newY = drag.origY + drag.origH - newH;
        }

        updateLayer(drag.layerId, {
          x: newX,
          y: newY,
          width: newW,
          height: newH,
        });
      } else if (drag.kind === "rotate") {
        const angle = Math.atan2(e.clientY - drag.cy, e.clientX - drag.cx);
        const delta = ((angle - drag.startAngle) * 180) / Math.PI;
        updateLayer(drag.layerId, {
          rotation: drag.origRot + delta,
        });
      }
    }
    function onUp() {
      setDrag(null);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag]);

  // ---- Save ---------------------------------------------------------------

  async function savePage() {
    if (!currentPage) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(
        `/api/stories/${story.id}/pages/${currentPage.pageNumber}/overlays`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            overlays: currentPage.overlays ?? [],
            layoutId: currentPage.layoutId ?? DEFAULT_LAYOUT_ID,
          }),
        }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Save failed");
      }
      setDirty((d) => ({ ...d, [currentPage.pageNumber]: false }));
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "Couldn't save changes."
      );
    } finally {
      setSaving(false);
    }
  }

  // ---- Sidebar actions ----------------------------------------------------

  async function handleUpload(file: File) {
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Upload failed");
      }
      const { url } = (await res.json()) as { url: string };
      addLayer(makeUploadImage(url));
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Upload failed");
    }
  }

  async function handleSvgUpload(file: File) {
    try {
      const text = await file.text();
      const parsed = parseUploadedSvg(text);
      if (!parsed) {
        setSaveError("That file didn't look like a valid SVG.");
        return;
      }
      addLayer(makePathShape(parsed.markup, parsed.viewBox));
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "Couldn't read the SVG file."
      );
    }
  }

  async function regenerateLayoutText() {
    if (!currentPage || regenPending) return;
    setRegenPending(true);
    setSaveError(null);
    try {
      const res = await fetch(
        `/api/stories/${story.id}/pages/${currentPage.pageNumber}/regenerate-text`,
        { method: "POST" }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Regeneration failed");
      }
      const { text } = (await res.json()) as { text: string };

      // Update page.text AND the layout-tagged text layer so both the reader
      // and the canvas stay in sync. Other text layers are untouched.
      updatePage(currentPage.pageNumber, (p) => ({
        ...p,
        text,
        overlays: (p.overlays ?? []).map((l) =>
          l.source === "layout" && l.type === "text"
            ? ({ ...l, text } as Layer)
            : l
        ),
      }));
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "Couldn't regenerate text"
      );
    } finally {
      setRegenPending(false);
    }
  }

  // ---- Render -------------------------------------------------------------

  const isDirty = !!dirty[currentPage?.pageNumber ?? -1];

  const selectedIsLayoutText = useMemo(
    () =>
      selectedLayer?.source === "layout" && selectedLayer?.type === "text",
    [selectedLayer]
  );

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6">
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href="/canvas"
            className="text-sm font-bold text-purple-400 hover:text-purple-600"
          >
            &larr; All stories
          </Link>
          <h1 className="mt-1 font-[family-name:var(--font-display)] text-2xl font-bold text-purple-700">
            Studio: {story.title}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          {saveError && (
            <span className="text-sm font-bold text-rose-500">{saveError}</span>
          )}
          {isDirty && !saving && (
            <span className="text-sm font-bold text-amber-500">
              Unsaved changes
            </span>
          )}
          <button
            type="button"
            onClick={savePage}
            disabled={saving || !isDirty}
            className="rounded-2xl bg-gradient-to-r from-purple-500 via-pink-500 to-orange-400 px-5 py-2 text-sm font-black text-white shadow-md shadow-purple-200 transition-all hover:scale-105 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
          >
            {saving ? "Saving..." : "Save page"}
          </button>
        </div>
      </div>

      {/* Page selector */}
      <div className="mb-4 flex flex-wrap gap-2">
        {story.pages.map((p, i) => (
          <button
            key={p.pageNumber}
            type="button"
            onClick={() => {
              setPageIdx(i);
              setSelectedId(null);
              setEditingTextId(null);
            }}
            className={`rounded-full px-4 py-1.5 text-xs font-black transition-all ${
              i === pageIdx
                ? "bg-gradient-to-r from-purple-400 to-pink-400 text-white shadow-md"
                : "bg-purple-50 text-purple-400 hover:bg-purple-100"
            } ${dirty[p.pageNumber] ? "ring-2 ring-amber-300" : ""}`}
          >
            Page {p.pageNumber}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[220px_1fr_260px]">
        {/* Left: tools sidebar */}
        <aside className="rounded-3xl border-2 border-purple-200 bg-white p-4 shadow-sm">
          <div className="mb-4 grid grid-cols-2 gap-1">
            {(["layouts", "text", "shapes", "upload"] as SidebarTab[]).map(
              (t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={`rounded-xl px-2 py-2 text-xs font-black uppercase transition-all ${
                    tab === t
                      ? "bg-purple-500 text-white"
                      : "bg-purple-50 text-purple-400 hover:bg-purple-100"
                  }`}
                >
                  {t}
                </button>
              )
            )}
          </div>

          {tab === "layouts" && (
            <div className="space-y-2">
              {LAYOUTS.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => applyLayout(l.id)}
                  className={`w-full overflow-hidden rounded-2xl border-2 text-left transition-all ${
                    currentLayoutId === l.id
                      ? "border-purple-400 bg-purple-50 shadow-md"
                      : "border-purple-100 bg-white hover:border-purple-300 hover:bg-purple-50"
                  }`}
                >
                  <div className="flex items-center gap-2 px-2 py-2">
                    <LayoutThumbnail layoutId={l.id} />
                    <span className="text-[11px] font-black uppercase text-purple-500">
                      {l.name}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}

          {tab === "text" && (
            <button
              type="button"
              onClick={() => addLayer(makeText())}
              className="w-full rounded-2xl border-2 border-dashed border-purple-300 bg-purple-50/50 px-3 py-6 text-center font-[family-name:var(--font-display)] text-2xl font-bold text-purple-600 hover:bg-purple-100"
            >
              Add text
            </button>
          )}

          {tab === "shapes" && (
            <ShapesPanel
              search={shapeSearch}
              onSearchChange={setShapeSearch}
              onAddPrimitive={(s) => addLayer(makePrimitiveShape(s))}
              onAddIcon={(name) => addLayer(makeIconShape(name))}
              onUploadSvg={handleSvgUpload}
            />
          )}

          {tab === "upload" && (
            <label className="flex w-full cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-purple-300 bg-purple-50/50 px-3 py-8 text-center text-sm font-bold text-purple-500 hover:bg-purple-100">
              <span className="text-2xl">&#128206;</span>
              <span className="mt-2">Upload image</span>
              <span className="mt-1 text-xs font-medium text-purple-300">
                PNG / JPG, max 5 MB
              </span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleUpload(f);
                  e.target.value = "";
                }}
              />
            </label>
          )}
        </aside>

        {/* Center: canvas */}
        <div className="flex items-center justify-center">
          <div
            ref={canvasRef}
            className="relative aspect-square w-full max-w-[720px] overflow-hidden rounded-3xl border-4 border-purple-200 bg-gradient-to-br from-purple-50 to-pink-50 shadow-xl"
            onPointerDown={() => {
              setSelectedId(null);
              setEditingTextId(null);
            }}
          >
            {/* Layers — image layers are part of this list now, no separate
                background image. */}
            {layers.map((layer) => (
              <LayerView
                key={layer.id}
                layer={layer}
                selected={selectedId === layer.id}
                editingText={editingTextId === layer.id}
                onPointerDown={(e) => startMove(e, layer)}
                onStartResize={(e, edge) => startResize(e, layer, edge)}
                onStartRotate={(e) => startRotate(e, layer)}
                onChangeText={(text) => updateLayer(layer.id, { text })}
                onDoubleClickText={() => setEditingTextId(layer.id)}
                onBlurText={() => setEditingTextId(null)}
              />
            ))}
          </div>
        </div>

        {/* Right: properties */}
        <aside className="rounded-3xl border-2 border-purple-200 bg-white p-4 shadow-sm">
          {selectedLayer ? (
            <PropertiesPanel
              layer={selectedLayer}
              showRegenerate={selectedIsLayoutText}
              regenPending={regenPending}
              onRegenerate={regenerateLayoutText}
              onChange={(patch) => updateLayer(selectedLayer.id, patch)}
              onDelete={() => deleteLayer(selectedLayer.id)}
            />
          ) : (
            <div className="py-10 text-center text-xs font-bold text-purple-300">
              Select a layer to edit its properties.
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LayoutThumbnail — tiny visual preview of a layout's image + text regions
// ---------------------------------------------------------------------------

function LayoutThumbnail({ layoutId }: { layoutId: string }) {
  const layout = getLayout(layoutId);
  const toPct = (v: number) => `${(v / CANVAS_SIZE) * 100}%`;
  return (
    <div className="relative h-10 w-10 flex-none overflow-hidden rounded border border-purple-200 bg-purple-50">
      <div
        className="absolute rounded-sm bg-purple-300"
        style={{
          left: toPct(layout.imageRegion.x),
          top: toPct(layout.imageRegion.y),
          width: toPct(layout.imageRegion.width),
          height: toPct(layout.imageRegion.height),
        }}
      />
      <div
        className="absolute rounded-sm bg-pink-400"
        style={{
          left: toPct(layout.textRegion.x),
          top: toPct(layout.textRegion.y),
          width: toPct(layout.textRegion.width),
          height: toPct(layout.textRegion.height),
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// LayerView — renders one layer with selection box, resize/rotate handles
// ---------------------------------------------------------------------------

interface LayerViewProps {
  layer: Layer;
  selected: boolean;
  editingText: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onStartResize: (e: React.PointerEvent, edge: ResizeEdge) => void;
  onStartRotate: (e: React.PointerEvent) => void;
  onChangeText: (t: string) => void;
  onDoubleClickText: () => void;
  onBlurText: () => void;
}

function LayerView({
  layer,
  selected,
  editingText,
  onPointerDown,
  onStartResize,
  onStartRotate,
  onChangeText,
  onDoubleClickText,
  onBlurText,
}: LayerViewProps) {
  const style: React.CSSProperties = {
    position: "absolute",
    left: `${(layer.x / CANVAS_SIZE) * 100}%`,
    top: `${(layer.y / CANVAS_SIZE) * 100}%`,
    width: `${(layer.width / CANVAS_SIZE) * 100}%`,
    height: `${(layer.height / CANVAS_SIZE) * 100}%`,
    transform: `rotate(${layer.rotation}deg)`,
    transformOrigin: "center center",
    cursor: selected ? "move" : "pointer",
  };

  return (
    <div style={style} onPointerDown={onPointerDown}>
      {layer.type === "text" && (
        <TextLayerContent
          layer={layer}
          editing={editingText}
          onChangeText={onChangeText}
          onDoubleClick={onDoubleClickText}
          onBlur={onBlurText}
        />
      )}
      {layer.type === "shape" && <ShapeRenderer layer={layer} />}
      {layer.type === "image" && <ImageLayerContent layer={layer} />}

      {selected && (
        <>
          {/* Dashed selection outline (non-interactive). */}
          <div
            className="pointer-events-none absolute inset-0 border-2 border-dashed border-purple-500"
            style={{ zIndex: 1 }}
          />

          {/* East (right) edge — grow rightward from left anchor. */}
          <div
            onPointerDown={(e) => onStartResize(e, "e")}
            style={{
              position: "absolute",
              top: 0,
              right: -8,
              width: 16,
              height: "100%",
              cursor: "ew-resize",
              zIndex: 10,
            }}
          />
          {/* West (left) edge — grow leftward from right anchor. */}
          <div
            onPointerDown={(e) => onStartResize(e, "w")}
            style={{
              position: "absolute",
              top: 0,
              left: -8,
              width: 16,
              height: "100%",
              cursor: "ew-resize",
              zIndex: 10,
            }}
          />
          {/* South (bottom) edge — grow downward from top anchor. */}
          <div
            onPointerDown={(e) => onStartResize(e, "s")}
            style={{
              position: "absolute",
              left: 0,
              bottom: -8,
              width: "100%",
              height: 16,
              cursor: "ns-resize",
              zIndex: 10,
            }}
          />
          {/* North (top) edge — grow upward from bottom anchor. */}
          <div
            onPointerDown={(e) => onStartResize(e, "n")}
            style={{
              position: "absolute",
              left: 0,
              top: -8,
              width: "100%",
              height: 16,
              cursor: "ns-resize",
              zIndex: 10,
            }}
          />

          {/* Midpoint markers (visual only — clicks go to the hit zones). */}
          <div
            className="pointer-events-none absolute top-1/2 h-6 w-2 -translate-y-1/2 rounded-full border-2 border-purple-500 bg-white"
            style={{ right: -5, zIndex: 11 }}
          />
          <div
            className="pointer-events-none absolute top-1/2 h-6 w-2 -translate-y-1/2 rounded-full border-2 border-purple-500 bg-white"
            style={{ left: -5, zIndex: 11 }}
          />
          <div
            className="pointer-events-none absolute left-1/2 h-2 w-6 -translate-x-1/2 rounded-full border-2 border-purple-500 bg-white"
            style={{ bottom: -5, zIndex: 11 }}
          />
          <div
            className="pointer-events-none absolute left-1/2 h-2 w-6 -translate-x-1/2 rounded-full border-2 border-purple-500 bg-white"
            style={{ top: -5, zIndex: 11 }}
          />

          {/* Southeast corner — both axes. Sits above the edge hit zones. */}
          <div
            onPointerDown={(e) => onStartResize(e, "se")}
            className="cursor-nwse-resize rounded-full border-2 border-purple-500 bg-white"
            style={{
              position: "absolute",
              bottom: -9,
              right: -9,
              width: 18,
              height: 18,
              zIndex: 12,
            }}
          />

          {/* Rotate */}
          <div
            onPointerDown={onStartRotate}
            className="cursor-grab rounded-full border-2 border-purple-500 bg-white"
            style={{
              position: "absolute",
              top: -32,
              left: "50%",
              transform: "translateX(-50%)",
              width: 16,
              height: 16,
              zIndex: 12,
            }}
          />
        </>
      )}
    </div>
  );
}

function TextLayerContent({
  layer,
  editing,
  onChangeText,
  onDoubleClick,
  onBlur,
}: {
  layer: TextLayer;
  editing: boolean;
  onChangeText: (t: string) => void;
  onDoubleClick: () => void;
  onBlur: () => void;
}) {
  // Share the autofit size between view mode (the rendered text) and edit
  // mode (the textarea) so double-clicking to edit doesn't cause the font
  // to jump. Binary-searches the largest px size whose rendered text fits
  // inside the container on every resize.
  const { containerRef, fontSizePx } = useAutoFitFontSize({
    text: layer.text,
    logicalWidth: layer.width,
    logicalMaxFontSize: layer.fontSize,
    fontFamily: layer.fontFamily,
    fontWeight: layer.fontWeight,
  });

  return (
    <div
      ref={containerRef}
      onDoubleClick={onDoubleClick}
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      {editing ? (
        <textarea
          autoFocus
          value={layer.text}
          onChange={(e) => onChangeText(e.target.value)}
          onBlur={onBlur}
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            width: "100%",
            height: "100%",
            color: layer.color,
            fontFamily: layer.fontFamily,
            fontWeight: layer.fontWeight,
            fontSize: `${fontSizePx}px`,
            lineHeight: 1.15,
            textAlign: "center",
            wordBreak: "break-word",
            background: "rgba(255,255,255,0.6)",
            border: "none",
            outline: "2px solid #7c3aed",
            resize: "none",
            padding: 0,
          }}
        />
      ) : (
        <div
          style={{
            color: layer.color,
            fontFamily: layer.fontFamily,
            fontWeight: layer.fontWeight,
            lineHeight: 1.15,
            textAlign: "center",
            wordBreak: "break-word",
            whiteSpace: "pre-wrap",
            width: "100%",
            fontSize: `${fontSizePx}px`,
          }}
        >
          {layer.text}
        </div>
      )}
    </div>
  );
}

function ImageLayerContent({ layer }: { layer: ImageLayer }) {
  // Layout-managed images should fill the region (cover); user-uploaded
  // images should letterbox (contain) to preserve their aspect.
  const fit = layer.source === "layout" ? "cover" : "contain";
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={layer.src}
      alt=""
      draggable={false}
      style={{
        width: "100%",
        height: "100%",
        objectFit: fit,
        userSelect: "none",
        pointerEvents: "none",
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// PropertiesPanel — right sidebar editing controls for the selected layer
// ---------------------------------------------------------------------------

function PropertiesPanel({
  layer,
  showRegenerate,
  regenPending,
  onRegenerate,
  onChange,
  onDelete,
}: {
  layer: Layer;
  showRegenerate: boolean;
  regenPending: boolean;
  onRegenerate: () => void;
  onChange: (patch: Partial<Layer>) => void;
  onDelete: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-black uppercase tracking-wider text-purple-400">
          {layer.type}
          {layer.source === "layout" && (
            <span className="ml-1 text-purple-300">· layout</span>
          )}
        </h3>
        <button
          type="button"
          onClick={onDelete}
          className="rounded-full bg-rose-50 px-3 py-1 text-xs font-black text-rose-500 hover:bg-rose-500 hover:text-white"
        >
          Delete
        </button>
      </div>

      {/* Common: size + rotation */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <NumberField
          label="W"
          value={Math.round(layer.width)}
          onChange={(v) => onChange({ width: v })}
        />
        <NumberField
          label="H"
          value={Math.round(layer.height)}
          onChange={(v) => onChange({ height: v })}
        />
        <NumberField
          label="X"
          value={Math.round(layer.x)}
          onChange={(v) => onChange({ x: v })}
        />
        <NumberField
          label="Y"
          value={Math.round(layer.y)}
          onChange={(v) => onChange({ y: v })}
        />
        <NumberField
          label="Rot"
          value={Math.round(layer.rotation)}
          onChange={(v) => onChange({ rotation: v })}
        />
      </div>

      {layer.type === "text" && (
        <>
          {showRegenerate && (
            <button
              type="button"
              onClick={onRegenerate}
              disabled={regenPending}
              className="w-full rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 px-3 py-2 text-xs font-black uppercase text-white shadow-md disabled:cursor-wait disabled:opacity-60"
            >
              {regenPending ? "Thinking..." : "Regenerate with AI"}
            </button>
          )}
          <Field label="Text">
            <textarea
              value={layer.text}
              onChange={(e) =>
                (onChange as (p: Partial<TextLayer>) => void)({
                  text: e.target.value,
                })
              }
              rows={3}
              className="w-full rounded-lg border-2 border-purple-200 bg-purple-50/40 px-2 py-1 text-xs font-medium text-purple-700"
            />
          </Field>
          <Field label="Font">
            <select
              value={layer.fontFamily}
              onChange={(e) =>
                (onChange as (p: Partial<TextLayer>) => void)({
                  fontFamily: e.target.value,
                })
              }
              className="w-full rounded-lg border-2 border-purple-200 bg-white px-2 py-1 text-xs font-bold text-purple-700"
            >
              {FONT_FAMILIES.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </Field>
          <NumberField
            label="Size"
            value={layer.fontSize}
            onChange={(v) =>
              (onChange as (p: Partial<TextLayer>) => void)({ fontSize: v })
            }
          />
          <Field label="Weight">
            <select
              value={layer.fontWeight}
              onChange={(e) =>
                (onChange as (p: Partial<TextLayer>) => void)({
                  fontWeight: e.target.value as TextLayer["fontWeight"],
                })
              }
              className="w-full rounded-lg border-2 border-purple-200 bg-white px-2 py-1 text-xs font-bold text-purple-700"
            >
              <option value="normal">Normal</option>
              <option value="bold">Bold</option>
            </select>
          </Field>
          <ColorField
            label="Color"
            value={layer.color}
            onChange={(v) =>
              (onChange as (p: Partial<TextLayer>) => void)({ color: v })
            }
          />
        </>
      )}

      {layer.type === "shape" && (
        <>
          <ColorField
            label="Fill"
            value={layer.fill}
            onChange={(v) =>
              (onChange as (p: Partial<ShapeLayer>) => void)({ fill: v })
            }
          />
          <ColorField
            label="Stroke"
            value={layer.stroke}
            onChange={(v) =>
              (onChange as (p: Partial<ShapeLayer>) => void)({ stroke: v })
            }
          />
          <NumberField
            label="Stroke W"
            value={layer.strokeWidth}
            onChange={(v) =>
              (onChange as (p: Partial<ShapeLayer>) => void)({ strokeWidth: v })
            }
          />
        </>
      )}
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex items-center gap-1 rounded-lg border-2 border-purple-100 bg-white px-2 py-1">
      <span className="text-[10px] font-black uppercase text-purple-300">
        {label}
      </span>
      <input
        type="number"
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(n);
        }}
        className="w-full bg-transparent text-xs font-bold text-purple-700 outline-none"
      />
    </label>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-purple-300">
        {label}
      </span>
      {children}
    </label>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value === "transparent" ? "#ffffff" : value}
          onChange={(e) => onChange(e.target.value)}
          className="h-7 w-10 cursor-pointer rounded border border-purple-200"
        />
        <button
          type="button"
          onClick={() => onChange("transparent")}
          className="rounded-md border border-purple-200 px-2 py-0.5 text-[10px] font-black uppercase text-purple-400 hover:bg-purple-50"
        >
          None
        </button>
      </div>
      <div className="mt-1 flex flex-wrap gap-1">
        {SWATCHES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            className="h-5 w-5 rounded border border-purple-200"
            style={{ background: c }}
            aria-label={c}
          />
        ))}
      </div>
    </Field>
  );
}

// ---------------------------------------------------------------------------
// ShapesPanel — primitives + searchable icon grid + custom SVG upload
// ---------------------------------------------------------------------------

function ShapesPanel({
  search,
  onSearchChange,
  onAddPrimitive,
  onAddIcon,
  onUploadSvg,
}: {
  search: string;
  onSearchChange: (v: string) => void;
  onAddPrimitive: (s: PrimitiveShape) => void;
  onAddIcon: (name: string) => void;
  onUploadSvg: (file: File) => void;
}) {
  const q = search.trim().toLowerCase();
  const primitives: { name: string; kind: PrimitiveShape }[] = [
    { name: "rectangle", kind: "rect" },
    { name: "circle", kind: "circle" },
    { name: "line", kind: "line" },
  ];
  const matchingPrimitives = q
    ? primitives.filter((p) => p.name.includes(q) || p.kind.includes(q))
    : primitives;

  const matchingIcons = q
    ? ICONS.filter(
        (i) =>
          i.name.includes(q) || i.category.toLowerCase().includes(q)
      )
    : ICONS;

  return (
    <div className="space-y-3">
      <input
        type="search"
        placeholder="Search shapes..."
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        className="w-full rounded-xl border-2 border-purple-200 bg-purple-50/40 px-3 py-2 text-xs font-bold text-purple-700 placeholder-purple-300 focus:border-purple-400 focus:outline-none"
      />

      <label className="flex w-full cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-purple-300 bg-purple-50/50 px-2 py-3 text-center text-[11px] font-black uppercase text-purple-500 hover:bg-purple-100">
        Upload custom SVG
        <span className="mt-0.5 text-[9px] font-medium normal-case text-purple-300">
          .svg file
        </span>
        <input
          type="file"
          accept=".svg,image/svg+xml"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onUploadSvg(f);
            e.target.value = "";
          }}
        />
      </label>

      <div className="max-h-[420px] space-y-3 overflow-y-auto pr-1">
        {matchingPrimitives.length > 0 && (
          <div>
            <p className="mb-1 px-1 text-[10px] font-black uppercase tracking-wider text-purple-300">
              Primitives
            </p>
            <div className="grid grid-cols-3 gap-1.5">
              {matchingPrimitives.map((p) => (
                <button
                  key={p.kind}
                  type="button"
                  onClick={() => onAddPrimitive(p.kind)}
                  title={p.name}
                  className="flex aspect-square items-center justify-center rounded-xl border-2 border-purple-200 bg-white text-xs font-black uppercase text-purple-500 hover:border-purple-400 hover:bg-purple-50"
                >
                  {p.kind === "rect" && (
                    <div className="h-7 w-7 rounded-md bg-purple-300" />
                  )}
                  {p.kind === "circle" && (
                    <div className="h-7 w-7 rounded-full bg-pink-300" />
                  )}
                  {p.kind === "line" && (
                    <div className="h-1 w-9 rounded-full bg-purple-500" />
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* When not searching, group by category with headers. When searching,
            flatten to a single list so matches across categories are visible
            together. */}
        {q ? (
          matchingIcons.length > 0 && (
            <div>
              <p className="mb-1 px-1 text-[10px] font-black uppercase tracking-wider text-purple-300">
                Results ({matchingIcons.length})
              </p>
              <div className="grid grid-cols-4 gap-1">
                {matchingIcons.map((i) => (
                  <IconButton
                    key={i.name}
                    name={i.name}
                    onClick={() => onAddIcon(i.name)}
                  />
                ))}
              </div>
            </div>
          )
        ) : (
          ICON_CATEGORIES.map((cat) => {
            const catIcons = ICONS.filter((i) => i.category === cat);
            if (catIcons.length === 0) return null;
            return (
              <div key={cat}>
                <p className="mb-1 px-1 text-[10px] font-black uppercase tracking-wider text-purple-300">
                  {cat} ({catIcons.length})
                </p>
                <div className="grid grid-cols-4 gap-1">
                  {catIcons.map((i) => (
                    <IconButton
                      key={i.name}
                      name={i.name}
                      onClick={() => onAddIcon(i.name)}
                    />
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>

      {matchingIcons.length === 0 && matchingPrimitives.length === 0 && (
        <p className="py-4 text-center text-[11px] font-medium text-purple-300">
          No shapes match &quot;{search}&quot;.
        </p>
      )}
    </div>
  );
}

function IconButton({
  name,
  onClick,
}: {
  name: string;
  onClick: () => void;
}) {
  const Icon = getIcon(name);
  return (
    <button
      type="button"
      onClick={onClick}
      title={name}
      className="flex aspect-square items-center justify-center rounded-lg border border-purple-100 bg-white p-1.5 text-purple-500 transition-all hover:scale-105 hover:border-purple-400 hover:bg-purple-50"
    >
      {Icon && (
        <Icon
          strokeWidth={2}
          className="h-full w-full"
        />
      )}
    </button>
  );
}
