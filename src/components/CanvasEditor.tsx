"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CANVAS_SIZE,
  type Entity,
  type ImageLayer,
  type Layer,
  type ShapeKind,
  type ShapeLayer,
  type Story,
  type StoryPage,
  type TextLayer,
} from "@/lib/types";

interface CanvasEditorProps {
  story: Story;
}

type SidebarTab = "text" | "shapes" | "upload" | "entities";

type Drag =
  | { kind: "move"; layerId: string; startX: number; startY: number; origX: number; origY: number }
  | {
      kind: "resize";
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
    x: 200,
    y: 350,
    width: 400,
    height: 80,
    rotation: 0,
    fontSize: 48,
    color: "#1f1147",
    fontFamily: "var(--font-display), serif",
    fontWeight: "bold",
  };
}

function makeShape(shape: ShapeKind): ShapeLayer {
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
  };
}

function makeImage(src: string, source: ImageLayer["source"]): ImageLayer {
  return {
    id: uid(),
    type: "image",
    src,
    source,
    x: 250,
    y: 250,
    width: 300,
    height: 300,
    rotation: 0,
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
  const [tab, setTab] = useState<SidebarTab>("text");
  const [drag, setDrag] = useState<Drag | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [dirty, setDirty] = useState<Record<number, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [stickerLoading, setStickerLoading] = useState<string | null>(null);

  const canvasRef = useRef<HTMLDivElement>(null);

  const currentPage = story.pages[pageIdx];
  const layers: Layer[] = currentPage?.overlays ?? [];
  const selectedLayer = layers.find((l) => l.id === selectedId) ?? null;

  // ---- Layer mutations -----------------------------------------------------

  const updatePageLayers = useCallback(
    (pageNumber: number, mutate: (layers: Layer[]) => Layer[]) => {
      setStory((prev) => ({
        ...prev,
        pages: prev.pages.map((p) =>
          p.pageNumber === pageNumber
            ? { ...p, overlays: mutate(p.overlays ?? []) }
            : p
        ),
      }));
      setDirty((d) => ({ ...d, [pageNumber]: true }));
    },
    []
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

  // Convert a client (pixel) delta to canvas-logical delta.
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

  function startResize(e: React.PointerEvent, layer: Layer) {
    e.stopPropagation();
    setDrag({
      kind: "resize",
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
        updateLayer(drag.layerId, {
          width: Math.max(20, drag.origW + dx),
          height: Math.max(20, drag.origH + dy),
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
          body: JSON.stringify({ overlays: currentPage.overlays ?? [] }),
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
      addLayer(makeImage(url, "upload"));
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Upload failed");
    }
  }

  // Loads an image URL into a canvas, makes near-white pixels transparent,
  // and returns a data URL of the result. Used so the white background that
  // Gemini puts on extracted stickers doesn't show as a white box on the
  // page. Threshold is generous (any RGB > 240 → alpha 0).
  async function whiteToTransparent(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new window.Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext("2d");
          if (!ctx) return reject(new Error("no 2d context"));
          ctx.drawImage(img, 0, 0);
          const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const px = data.data;
          for (let i = 0; i < px.length; i += 4) {
            if (px[i] > 240 && px[i + 1] > 240 && px[i + 2] > 240) {
              px[i + 3] = 0;
            }
          }
          ctx.putImageData(data, 0, 0);
          resolve(canvas.toDataURL("image/png"));
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = () => reject(new Error("image load failed"));
      img.src = url;
    });
  }

  async function addEntitySticker(entity: Entity) {
    if (stickerLoading || !currentPage) return;
    setStickerLoading(entity.id);
    setSaveError(null);
    try {
      // Pull this entity OUT of the current page image. Server runs Gemini
      // image-to-image twice (extract + inpaint) and returns a sticker URL
      // and a "clean" version of the page with the entity removed.
      const res = await fetch(
        `/api/stories/${story.id}/pages/${currentPage.pageNumber}/extract`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entityId: entity.id }),
        }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Extraction failed");
      }
      const { stickerUrl, cleanImageUrl } = (await res.json()) as {
        stickerUrl: string;
        cleanImageUrl: string;
        cached: boolean;
      };

      // Chroma-key the white sticker background to transparent on the
      // client. The result is a data URL — we keep it short-lived in the
      // layer's src; if the user saves the page, this gets persisted as-is.
      const transparentSrc = await whiteToTransparent(stickerUrl);

      // Update the current page in local state: swap the background to the
      // inpainted version, cache the extraction, and add the sticker layer.
      setStory((prev) => ({
        ...prev,
        pages: prev.pages.map((p) =>
          p.pageNumber === currentPage.pageNumber
            ? {
                ...p,
                cleanImageUrl,
                extractions: {
                  ...(p.extractions ?? {}),
                  [entity.id]: { stickerUrl },
                },
              }
            : p
        ),
      }));
      // The new layer is added with the transparent data URL so it renders
      // correctly even before the user saves.
      addLayer(makeImage(transparentSrc, "sticker"));
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "Couldn't extract entity"
      );
    } finally {
      setStickerLoading(null);
    }
  }

  // ---- Render -------------------------------------------------------------

  const groupedEntities = useMemo(() => {
    const out: Record<string, Entity[]> = {
      character: [],
      environment: [],
      object: [],
    };
    for (const e of story.entities ?? []) out[e.type].push(e);
    return out;
  }, [story.entities]);

  const isDirty = !!dirty[currentPage?.pageNumber ?? -1];

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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[200px_1fr_260px]">
        {/* Left: tools sidebar */}
        <aside className="rounded-3xl border-2 border-purple-200 bg-white p-4 shadow-sm">
          <div className="mb-4 grid grid-cols-2 gap-1">
            {(["text", "shapes", "upload", "entities"] as SidebarTab[]).map(
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
            <div className="grid grid-cols-2 gap-2">
              {(["rect", "circle", "line"] as ShapeKind[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => addLayer(makeShape(s))}
                  className="flex aspect-square items-center justify-center rounded-2xl border-2 border-purple-200 bg-white text-xs font-black uppercase text-purple-500 hover:border-purple-400 hover:bg-purple-50"
                >
                  {s === "rect" && (
                    <div className="h-10 w-10 rounded-md bg-purple-300" />
                  )}
                  {s === "circle" && (
                    <div className="h-10 w-10 rounded-full bg-pink-300" />
                  )}
                  {s === "line" && (
                    <div className="h-1 w-12 rounded-full bg-purple-500" />
                  )}
                </button>
              ))}
            </div>
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

          {tab === "entities" && (
            <div className="space-y-3">
              {(["character", "environment", "object"] as const).map((type) => {
                const list = groupedEntities[type];
                if (!list || list.length === 0) return null;
                return (
                  <div key={type}>
                    <p className="mb-1 px-1 text-[10px] font-black uppercase tracking-wider text-purple-300">
                      {type}s
                    </p>
                    <div className="space-y-1">
                      {list.map((e) => (
                        <button
                          key={e.id}
                          type="button"
                          onClick={() => addEntitySticker(e)}
                          disabled={stickerLoading === e.id}
                          className="w-full truncate rounded-xl border-2 border-purple-100 bg-white px-2 py-2 text-left text-xs font-bold text-purple-500 hover:border-purple-300 hover:bg-purple-50 disabled:cursor-wait disabled:opacity-60"
                        >
                          {stickerLoading === e.id ? "Generating..." : e.name}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
              {(story.entities?.length ?? 0) === 0 && (
                <p className="text-xs font-medium text-purple-300">
                  No entities yet. Open the AI edit page first to extract them.
                </p>
              )}
            </div>
          )}
        </aside>

        {/* Center: canvas */}
        <div className="flex items-center justify-center">
          <div
            ref={canvasRef}
            className="relative aspect-square w-full max-w-[720px] overflow-hidden rounded-3xl border-4 border-purple-200 bg-white shadow-xl"
            onPointerDown={() => {
              setSelectedId(null);
              setEditingTextId(null);
            }}
          >
            {/* Background image. Prefer the inpainted (clean) version if
                we've extracted any entities from this page — otherwise the
                original page image. */}
            {(currentPage?.cleanImageUrl || currentPage?.imageUrl) && (
              <Image
                src={currentPage.cleanImageUrl || currentPage.imageUrl}
                alt={`Page ${currentPage.pageNumber}`}
                fill
                className="select-none object-cover"
                draggable={false}
                unoptimized
              />
            )}

            {/* Layers */}
            {layers.map((layer) => (
              <LayerView
                key={layer.id}
                layer={layer}
                selected={selectedId === layer.id}
                editingText={editingTextId === layer.id}
                onPointerDown={(e) => startMove(e, layer)}
                onStartResize={(e) => startResize(e, layer)}
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
// LayerView — renders one layer with selection box, resize/rotate handles
// ---------------------------------------------------------------------------

interface LayerViewProps {
  layer: Layer;
  selected: boolean;
  editingText: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onStartResize: (e: React.PointerEvent) => void;
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
  // Position uses percentages of CANVAS_SIZE so the canvas can scale.
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
      {layer.type === "shape" && <ShapeLayerContent layer={layer} />}
      {layer.type === "image" && <ImageLayerContent layer={layer} />}

      {selected && (
        <>
          <div className="pointer-events-none absolute inset-0 border-2 border-dashed border-purple-500" />
          {/* Resize handle (bottom-right) */}
          <div
            onPointerDown={onStartResize}
            className="absolute -bottom-2 -right-2 h-4 w-4 cursor-nwse-resize rounded-full border-2 border-purple-500 bg-white"
          />
          {/* Rotate handle (top-center) */}
          <div
            onPointerDown={onStartRotate}
            className="absolute -top-8 left-1/2 h-4 w-4 -translate-x-1/2 cursor-grab rounded-full border-2 border-purple-500 bg-white"
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
  // Scale font size relative to the canvas, since width/height are percentages.
  const inner: React.CSSProperties = {
    width: "100%",
    height: "100%",
    color: layer.color,
    fontFamily: layer.fontFamily,
    fontWeight: layer.fontWeight,
    fontSize: `${(layer.fontSize / CANVAS_SIZE) * 100}cqw`,
    lineHeight: 1.1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    containerType: "inline-size",
    overflow: "hidden",
    wordBreak: "break-word",
  };

  if (editing) {
    return (
      <textarea
        autoFocus
        value={layer.text}
        onChange={(e) => onChangeText(e.target.value)}
        onBlur={onBlur}
        onPointerDown={(e) => e.stopPropagation()}
        style={{
          ...inner,
          background: "rgba(255,255,255,0.6)",
          border: "none",
          outline: "2px solid #7c3aed",
          resize: "none",
        }}
      />
    );
  }
  return (
    <div onDoubleClick={onDoubleClick} style={inner}>
      {layer.text}
    </div>
  );
}

function ShapeLayerContent({ layer }: { layer: ShapeLayer }) {
  if (layer.shape === "rect") {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: layer.fill,
          border: `${layer.strokeWidth}px solid ${layer.stroke}`,
          borderRadius: 12,
        }}
      />
    );
  }
  if (layer.shape === "circle") {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: layer.fill,
          border: `${layer.strokeWidth}px solid ${layer.stroke}`,
          borderRadius: "50%",
        }}
      />
    );
  }
  // line
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: layer.stroke,
        borderRadius: 999,
      }}
    />
  );
}

function ImageLayerContent({ layer }: { layer: ImageLayer }) {
  return (
    // Plain <img> here (not next/image) — the URL set could be external,
    // and next/image with fill needs a positioned parent which we already
    // have, but we want object-contain and we don't want optimization on
    // user uploads.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={layer.src}
      alt=""
      draggable={false}
      style={{
        width: "100%",
        height: "100%",
        objectFit: "contain",
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
  onChange,
  onDelete,
}: {
  layer: Layer;
  onChange: (patch: Partial<Layer>) => void;
  onDelete: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-black uppercase tracking-wider text-purple-400">
          {layer.type}
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
          <Field label="Text">
            <textarea
              value={layer.text}
              onChange={(e) =>
                (onChange as (p: Partial<TextLayer>) => void)({
                  text: e.target.value,
                })
              }
              rows={2}
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
