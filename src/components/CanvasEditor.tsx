"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CANVAS_SIZE,
  type CustomLayout,
  type ImageLayer,
  type Layer,
  type Layout,
  type Rect,
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
import { useUndoableHistory } from "./useUndoableHistory";
import ShapeRenderer from "./ShapeRenderer";
import { ICONS, ICON_CATEGORIES, getIcon } from "@/lib/shapeIcons";
import { Undo2, Redo2 } from "lucide-react";
import AIAssistantPanel from "./AIAssistantPanel";
import {
  FONT_CATEGORY_LABELS,
  FONT_CATEGORY_ORDER,
  FONT_OPTIONS,
  findFontByFamily,
  type FontCategory,
  type FontOption,
} from "@/lib/fonts";
import { useMediaQuery } from "@/lib/useMediaQuery";

interface CanvasEditorProps {
  story: Story;
  // The pet linked to this story, if any. Drives layout filtering
  // (memorial-only layouts hide on living/generic stories) and is
  // surfaced in the editor header.
  pet?: import("@/lib/types").Pet | null;
}

type SidebarTab = "layouts" | "text" | "shapes" | "images" | "assistant";

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

// Poll /api/jobs/[id] until the Inngest function completes. Used by any
// studio action that enqueues a Gemini job (currently just regenerate-text).
async function pollJob<T>(jobId: string): Promise<T> {
  const MAX = 180; // 3 min
  for (let i = 0; i < MAX; i++) {
    try {
      const res = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" });
      if (res.ok) {
        const row = (await res.json()) as {
          status: "queued" | "running" | "done" | "failed";
          result: T | null;
          error: string | null;
        };
        if (row.status === "done") return (row.result ?? null) as T;
        if (row.status === "failed") {
          throw new Error(row.error ?? "Generation failed");
        }
      }
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("Generation failed"))
        throw err;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("Generation timed out");
}

function makeText(
  opts: {
    text?: string;
    fontSize?: number;
    fontWeight?: TextLayer["fontWeight"];
    fontFamily?: string;
  } = {}
): TextLayer {
  return {
    id: uid(),
    type: "text",
    text: opts.text ?? "Double-click to edit",
    x: 240,
    y: 360,
    width: 320,
    height: 80,
    rotation: 0,
    fontSize: opts.fontSize ?? 24,
    color: "#1d2620",
    fontFamily: opts.fontFamily ?? "var(--font-display), serif",
    fontWeight: opts.fontWeight ?? "bold",
    source: "user",
  };
}

// Text tab presets. Each is a one-click "add a text box pre-sized for X"
// affordance. Sizes mirror the design spec (28/18/11) and the labels are
// what the user sees in the preview row.
const TEXT_PRESETS: Array<{
  label: string;
  fontSize: number;
  fontWeight: TextLayer["fontWeight"];
  fontFamily: string;
}> = [
  {
    label: "Heading",
    fontSize: 28,
    fontWeight: "bold",
    fontFamily: 'var(--font-display), "EB Garamond", serif',
  },
  {
    label: "Story body",
    fontSize: 18,
    fontWeight: "normal",
    fontFamily: 'var(--font-display), "EB Garamond", serif',
  },
  {
    label: "Caption",
    fontSize: 11,
    fontWeight: "normal",
    fontFamily: '"Albert Sans", var(--font-sans), system-ui, sans-serif',
  },
];

// Fonts users can pick from the "Story fonts" list. Each click adds a
// 18px sample text in that family — clicking again with a layer
// selected swaps the family.
const STORY_FONTS: Array<{ label: string; family: string }> = [
  {
    label: "EB Garamond",
    family: 'var(--font-display), "EB Garamond", serif',
  },
  { label: "Lora", family: '"Lora", serif' },
  { label: "Crimson Pro", family: '"Crimson Pro", serif' },
  {
    label: "Albert Sans",
    family: '"Albert Sans", var(--font-sans), system-ui, sans-serif',
  },
];

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

// Empty image placeholder — user can drop an image onto it, upload one, or
// open the picker modal to choose one from this comic. src=="" is the
// "show the drop target" state. fit: "cover" so a dropped image fills the
// frame instead of letterboxing (makeImageBox is a frame, not a sticker).
function makeImageBox(): ImageLayer {
  return {
    id: uid(),
    type: "image",
    src: "",
    x: 240,
    y: 240,
    width: 320,
    height: 320,
    rotation: 0,
    source: "user",
    fit: "cover",
  };
}

// Custom MIME used by the Images tab when dragging a thumbnail. Consumers
// check for this (in addition to text/uri-list) so random images dragged
// from outside the app don't accidentally fill a box.
const IMAGE_DRAG_MIME = "application/x-storyink-image";

// Font registry now lives in src/lib/fonts.ts (top 50 Google Fonts +
// the two site-theme faces). The picker below renders each option in
// its own face so users see what they're selecting.

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

// The outer export gates the heavy editor implementation on viewport
// width. Below md (phones) we render <StudioMobileNotice> instead —
// the inner editor never mounts, so none of its state/effects/listeners
// allocate. SSR defaults `isDesktop` to true so the server-rendered
// HTML matches the desktop path; phones unmount the editor on the
// first client paint.
//
// Splitting the gate out of the implementation keeps the Rules of
// Hooks happy: the outer component calls exactly one hook, the inner
// component calls many but only mounts when the viewport allows it.
export default function CanvasEditor(props: CanvasEditorProps) {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  if (!isDesktop) {
    return <StudioMobileNotice storyId={props.story.id} />;
  }
  return <CanvasEditorDesktop {...props} />;
}

function CanvasEditorDesktop({
  story: initialStory,
  pet = null,
}: CanvasEditorProps) {
  const [story, setStory] = useState<Story>(initialStory);

  // Undo / redo history of the story.pages slice. The hook only stores
  // snapshots — the live story state is still useState above. Snapshots
  // are captured on user-action boundaries (drag-start, atomic
  // mutations, edit-start) so a single undo step rolls back one
  // logical action regardless of how many state updates it triggered.
  const history = useUndoableHistory();
  const snapshotPages = useCallback(() => {
    history.snapshot(story.pages);
  }, [history, story.pages]);
  // Mark only the pages that actually differ between `current` and
  // `restored` as dirty. Most actions touch a single page — the
  // snapshot captures the whole pages array but pages outside the
  // action keep their previous reference, so a reference compare
  // tells us exactly which pages need re-saving.
  const markChangedPagesDirty = useCallback(
    (current: typeof story.pages, restored: typeof story.pages) => {
      setDirty((d) => {
        const next = { ...d };
        for (let i = 0; i < restored.length; i++) {
          if (current[i] !== restored[i]) {
            next[restored[i].pageNumber] = true;
          }
        }
        return next;
      });
    },
    []
  );

  const handleUndo = useCallback(() => {
    const current = story.pages;
    const restored = history.undo(current);
    if (!restored) return;
    setStory((s) => ({ ...s, pages: restored }));
    setSelectedId(null);
    setEditingTextId(null);
    markChangedPagesDirty(current, restored);
  }, [history, story.pages, markChangedPagesDirty]);
  const handleRedo = useCallback(() => {
    const current = story.pages;
    const restored = history.redo(current);
    if (!restored) return;
    setStory((s) => ({ ...s, pages: restored }));
    setSelectedId(null);
    setEditingTextId(null);
    markChangedPagesDirty(current, restored);
  }, [history, story.pages, markChangedPagesDirty]);
  // Built-in layouts are filtered by mode: memorial-only layouts only
  // show when the story's pet is in memorial mode. Custom layouts are
  // never filtered (user can always reuse their own presets).
  const visibleBuiltinLayouts = useMemo(
    () =>
      LAYOUTS.filter((l) =>
        l.modeFilter === "memorial" ? pet?.mode === "memorial" : true
      ),
    [pet]
  );
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

  // Custom layouts (saved from this Studio). Fetched once on mount; new saves
  // prepend to the list so they appear immediately in the Layouts tab.
  const [customLayouts, setCustomLayouts] = useState<CustomLayout[]>([]);

  // Does clicking a layout tile apply to the whole book or just the page
  // the user is looking at? Default is "page" so a layout click can't
  // accidentally rewrite the entire book — switching to "all" is the
  // intentional, extra-click action for batch-applying.
  const [layoutScope, setLayoutScope] = useState<"all" | "page">("page");

  // "Define your layout" mode. Non-null while the user is arranging the
  // IMAGE and TEXT rectangles on the canvas. A layout has >=1 image region
  // and >=1 text region; extras beyond the first become empty placeholder
  // slots once the layout is applied. `active` tracks which rect shows the
  // remove button.
  const [defineMode, setDefineMode] = useState<
    | {
        imageRects: Rect[];
        textRects: Rect[];
        active: { kind: "image" | "text"; index: number } | null;
      }
    | null
  >(null);
  const [defineName, setDefineName] = useState("");
  const [defineScope, setDefineScope] = useState<"story" | "global">("story");
  const [saveLayoutPending, setSaveLayoutPending] = useState(false);
  const [saveLayoutError, setSaveLayoutError] = useState<string | null>(null);

  // Image picker modal — open when the user clicks "Choose image" on an
  // empty image box. Holds the layer id the modal should write back to.
  const [pickingLayerId, setPickingLayerId] = useState<string | null>(null);

  const canvasRef = useRef<HTMLDivElement>(null);

  const currentPage = story.pages[pageIdx];
  // Memoized so the deps of the keyboard-nav useEffect below don't
  // churn on every render (?? produces a fresh empty array each pass).
  const layers: Layer[] = useMemo(
    () => currentPage?.overlays ?? [],
    [currentPage]
  );
  const selectedLayer = layers.find((l) => l.id === selectedId) ?? null;
  const currentLayoutId = currentPage?.layoutId ?? DEFAULT_LAYOUT_ID;

  // Fetch this story's custom layouts (globals + scoped to this story).
  useEffect(() => {
    const url = `/api/custom-layouts?storyId=${encodeURIComponent(story.id)}`;
    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("load failed"))))
      .then((d: { layouts: CustomLayout[] }) =>
        setCustomLayouts(d.layouts ?? [])
      )
      .catch(() => {
        // Non-fatal: user just won't see saved layouts until a successful
        // refetch. The built-in presets still work.
      });
  }, [story.id]);

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
      snapshotPages();
      updatePageLayers(currentPage.pageNumber, (ls) => [...ls, layer]);
      setSelectedId(layer.id);
    },
    [currentPage, updatePageLayers, snapshotPages]
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
      snapshotPages();
      updatePageLayers(currentPage.pageNumber, (ls) =>
        ls.filter((l) => l.id !== id)
      );
      if (selectedId === id) setSelectedId(null);
    },
    [currentPage, selectedId, updatePageLayers, snapshotPages]
  );

  // Apply an AI-regenerated text to the current page: update both page.text
  // (so the reader stays in sync) and the layout-tagged text layer inside
  // overlays (so the studio reflects it without the user re-opening).
  // Mirrors the /regenerate-text route's write pattern.
  const applyAssistantText = useCallback(
    (newText: string) => {
      if (!currentPage) return;
      snapshotPages();
      updatePage(currentPage.pageNumber, (p) => ({
        ...p,
        text: newText,
        overlays: (p.overlays ?? []).map((l) =>
          l.source === "layout" && l.type === "text" ? { ...l, text: newText } : l
        ),
      }));
    },
    [currentPage, updatePage, snapshotPages]
  );

  // Apply an AI-regenerated image URL: update page.imageUrl (for the reader)
  // and the layout-tagged image layer's src (for the studio).
  const applyAssistantImage = useCallback(
    (newImageUrl: string) => {
      if (!currentPage) return;
      snapshotPages();
      updatePage(currentPage.pageNumber, (p) => ({
        ...p,
        imageUrl: newImageUrl,
        overlays: (p.overlays ?? []).map((l) =>
          l.source === "layout" && l.type === "image"
            ? { ...l, src: newImageUrl }
            : l
        ),
      }));
    },
    [currentPage, updatePage, snapshotPages]
  );

  const onStoryPromptSaved = useCallback((newPrompt: string | null) => {
    setStory((prev) => ({ ...prev, ai_system_prompt: newPrompt }));
  }, []);

  const applyLayout = useCallback(
    (layoutId: string, scope: "all" | "page" = layoutScope) => {
      if (!currentPage) return;
      snapshotPages();
      const layout = getLayout(layoutId, customLayouts);
      const targetPageNumber = currentPage.pageNumber;
      setStory((prev) => ({
        ...prev,
        pages: prev.pages.map((p) => {
          if (scope === "page" && p.pageNumber !== targetPageNumber) return p;
          return {
            ...p,
            layoutId,
            overlays: morphLayersToLayout(p.overlays ?? [], layout),
          };
        }),
      }));
      setDirty((d) => {
        const next = { ...d };
        if (scope === "all") {
          for (const p of story.pages) next[p.pageNumber] = true;
        } else {
          next[targetPageNumber] = true;
        }
        return next;
      });
    },
    [currentPage, customLayouts, story.pages, layoutScope, snapshotPages]
  );

  // ---- Custom layout definition -------------------------------------------

  const startDefineLayout = useCallback(() => {
    const base = getLayout(currentLayoutId, customLayouts);
    setDefineMode({
      imageRects: [
        { ...base.imageRegion },
        ...(base.extraImageRegions ?? []).map((r) => ({ ...r })),
      ],
      textRects: [
        { ...base.textRegion },
        ...(base.extraTextRegions ?? []).map((r) => ({ ...r })),
      ],
      active: null,
    });
    setDefineName("");
    setDefineScope("story");
    setSaveLayoutError(null);
    setSelectedId(null);
    setEditingTextId(null);
  }, [currentLayoutId, customLayouts]);

  const cancelDefineLayout = useCallback(() => {
    setDefineMode(null);
    setSaveLayoutError(null);
  }, []);

  // Place a newly-added box a little below-right of the last one of its kind
  // so stacks of boxes aren't all piled in the same spot.
  function nextBoxPosition(existing: Rect[], size: number): Rect {
    const offset = existing.length * 40;
    const x = Math.min(CANVAS_SIZE - size, 80 + offset);
    const y = Math.min(CANVAS_SIZE - size, 80 + offset);
    return { x, y, width: size, height: size };
  }

  const addDefineImageBox = useCallback(() => {
    setDefineMode((m) => {
      if (!m) return m;
      const rect = nextBoxPosition(m.imageRects, 260);
      return {
        ...m,
        imageRects: [...m.imageRects, rect],
        active: { kind: "image", index: m.imageRects.length },
      };
    });
  }, []);

  const addDefineTextBox = useCallback(() => {
    setDefineMode((m) => {
      if (!m) return m;
      const rect = { ...nextBoxPosition(m.textRects, 240), height: 120 };
      return {
        ...m,
        textRects: [...m.textRects, rect],
        active: { kind: "text", index: m.textRects.length },
      };
    });
  }, []);

  const removeDefineBox = useCallback(
    (kind: "image" | "text", index: number) => {
      setDefineMode((m) => {
        if (!m) return m;
        const list = kind === "image" ? m.imageRects : m.textRects;
        // Every layout needs at least one of each kind.
        if (list.length <= 1) return m;
        const nextList = list.filter((_, i) => i !== index);
        return {
          ...m,
          imageRects: kind === "image" ? nextList : m.imageRects,
          textRects: kind === "text" ? nextList : m.textRects,
          active: null,
        };
      });
    },
    []
  );

  const saveCustomLayout = useCallback(async () => {
    if (!defineMode) return;
    const name = defineName.trim();
    if (!name) {
      setSaveLayoutError("Give your layout a name.");
      return;
    }
    if (defineMode.imageRects.length === 0 || defineMode.textRects.length === 0) {
      setSaveLayoutError("Layout needs at least one image and one text box.");
      return;
    }
    setSaveLayoutPending(true);
    setSaveLayoutError(null);
    try {
      const [primaryImage, ...extraImages] = defineMode.imageRects;
      const [primaryText, ...extraTexts] = defineMode.textRects;
      const res = await fetch("/api/custom-layouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          imageRegion: primaryImage,
          textRegion: primaryText,
          extraImageRegions: extraImages,
          extraTextRegions: extraTexts,
          storyId: defineScope === "story" ? story.id : undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Save failed");
      }
      const { layout } = (await res.json()) as { layout: CustomLayout };
      setCustomLayouts((prev) => [layout, ...prev]);
      setDefineMode(null);
      // Apply immediately so the user sees their freshly-designed layout
      // on the current page(s) without an extra click. Honors the same
      // per-page / all-pages toggle as the regular Apply action.
      if (currentPage) {
        const built = getLayout(layout.id, [layout]);
        const targetPageNumber = currentPage.pageNumber;
        setStory((prev) => ({
          ...prev,
          pages: prev.pages.map((p) => {
            if (layoutScope === "page" && p.pageNumber !== targetPageNumber)
              return p;
            return {
              ...p,
              layoutId: layout.id,
              overlays: morphLayersToLayout(p.overlays ?? [], built),
            };
          }),
        }));
        setDirty((d) => {
          const next = { ...d };
          if (layoutScope === "all") {
            for (const p of story.pages) next[p.pageNumber] = true;
          } else {
            next[targetPageNumber] = true;
          }
          return next;
        });
      }
    } catch (err) {
      setSaveLayoutError(
        err instanceof Error ? err.message : "Couldn't save layout."
      );
    } finally {
      setSaveLayoutPending(false);
    }
  }, [
    defineMode,
    defineName,
    defineScope,
    story.id,
    story.pages,
    currentPage,
    layoutScope,
  ]);

  // Studio keyboard nav.
  //
  // Bindings (active when not editing a text overlay inline and not
  // typing in a form field):
  //   - Arrow keys           → nudge the selected layer 1px (10px with Shift).
  //   - Delete / Backspace   → remove the selected layer.
  //   - Escape               → deselect.
  //   - Tab                  → cycle to the next layer (visual order).
  //   - Cmd/Ctrl+Z / Y       → undo / redo (already wired below).
  //
  // Drag-and-drop keyboard alternatives (e.g. moving a layer between
  // pages via the keyboard) are not yet wired — followup.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Undo / redo. Skip when the focus is in an input/textarea so
      // browser-native undo (e.g. typing rollback) keeps working.
      const target = e.target as HTMLElement | null;
      const inField =
        !!target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      const meta = e.metaKey || e.ctrlKey;
      if (meta && (e.key === "z" || e.key === "Z")) {
        if (inField) return;
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
        return;
      }
      if (meta && (e.key === "y" || e.key === "Y")) {
        if (inField) return;
        e.preventDefault();
        handleRedo();
        return;
      }

      if (editingTextId) return;
      if (inField) return;

      // Selection-aware keys (arrows / Delete / Backspace / Escape /
      // Tab) only engage when focus is actually on the canvas. The
      // previous version listened on `window` unconditionally, which
      // meant Tabbing into a side panel or clicking out of the canvas
      // still hijacked Tab/arrows and broke keyboard nav across the
      // whole Studio. Gate on activeElement === canvas so the canvas
      // owns these keys only while it's focused.
      if (document.activeElement !== canvasRef.current) return;

      if (e.key === "Escape" && selectedId) {
        e.preventDefault();
        setSelectedId(null);
        return;
      }

      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        e.preventDefault();
        deleteLayer(selectedId);
        return;
      }

      // Arrow-key nudge. 1px default, 10px with Shift. Logical
      // coordinates — see CANVAS_SIZE.
      if (
        selectedId &&
        (e.key === "ArrowUp" ||
          e.key === "ArrowDown" ||
          e.key === "ArrowLeft" ||
          e.key === "ArrowRight")
      ) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx =
          e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy =
          e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        if (!currentPage) return;
        snapshotPages();
        updatePageLayers(currentPage.pageNumber, (ls) =>
          ls.map((l) =>
            l.id === selectedId ? { ...l, x: l.x + dx, y: l.y + dy } : l
          )
        );
        return;
      }

      // Tab cycles to the next layer in visual order (top to bottom).
      // After selecting we re-focus the canvas so subsequent arrows /
      // Delete / Backspace land on it (a side-panel button could have
      // briefly taken focus before the canvas swallowed Tab).
      if (e.key === "Tab") {
        if (!layers.length) return;
        e.preventDefault();
        const ordered = [...layers].sort((a, b) => a.y - b.y || a.x - b.x);
        if (!selectedId) {
          setSelectedId(ordered[e.shiftKey ? ordered.length - 1 : 0].id);
          canvasRef.current?.focus();
          return;
        }
        const idx = ordered.findIndex((l) => l.id === selectedId);
        const nextIdx =
          (idx + (e.shiftKey ? -1 : 1) + ordered.length) % ordered.length;
        setSelectedId(ordered[nextIdx].id);
        canvasRef.current?.focus();
        return;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    selectedId,
    deleteLayer,
    editingTextId,
    handleUndo,
    handleRedo,
    layers,
    currentPage,
    snapshotPages,
    updatePageLayers,
  ]);

  // ---- Drag / resize / rotate ---------------------------------------------

  function clientToCanvasScale(): number {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 1;
    return CANVAS_SIZE / rect.width;
  }

  function startMove(e: React.PointerEvent, layer: Layer) {
    e.stopPropagation();
    setSelectedId(layer.id);
    // Snapshot pre-drag state so the entire drag is one undo step.
    snapshotPages();
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
    snapshotPages();
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
    snapshotPages();
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

  // Bulk-save every page that has pending changes. Useful after an "apply
  // to all pages" layout change, or when the user has bounced between
  // several pages and forgot which ones were edited.
  //
  // Requests fan out in parallel. Each page's save is independent at the
  // DB layer (atomic jsonb_set on the pages array, see
  // update_story_page_fields), so one failure won't corrupt another
  // page. We collect all failures and surface a single summarized error
  // so the user sees which pages still need attention.
  async function saveAllPages() {
    const dirtyPageNumbers = story.pages
      .map((p) => p.pageNumber)
      .filter((pn) => dirty[pn]);
    if (dirtyPageNumbers.length === 0) return;

    setSaving(true);
    setSaveError(null);

    const results = await Promise.all(
      dirtyPageNumbers.map(async (pageNumber) => {
        const page = story.pages.find((p) => p.pageNumber === pageNumber);
        if (!page) return { pageNumber, ok: true as const };
        try {
          const res = await fetch(
            `/api/stories/${story.id}/pages/${pageNumber}/overlays`,
            {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                overlays: page.overlays ?? [],
                layoutId: page.layoutId ?? DEFAULT_LAYOUT_ID,
              }),
            }
          );
          if (!res.ok) {
            const body = (await res.json().catch(() => ({}))) as {
              error?: string;
            };
            return {
              pageNumber,
              ok: false as const,
              error: body.error || `HTTP ${res.status}`,
            };
          }
          return { pageNumber, ok: true as const };
        } catch (err) {
          return {
            pageNumber,
            ok: false as const,
            error: err instanceof Error ? err.message : "Save failed",
          };
        }
      })
    );

    const succeeded = results.filter((r) => r.ok).map((r) => r.pageNumber);
    const failed = results.filter((r) => !r.ok);

    if (succeeded.length > 0) {
      setDirty((d) => {
        const next = { ...d };
        for (const pn of succeeded) next[pn] = false;
        return next;
      });
    }

    if (failed.length > 0) {
      const pages = failed.map((f) => f.pageNumber).join(", ");
      const firstMessage = failed[0].error ?? "Save failed";
      setSaveError(
        failed.length === 1
          ? `Page ${pages}: ${firstMessage}`
          : `${failed.length} pages failed to save (${pages}). First error: ${firstMessage}`
      );
    }
    setSaving(false);
  }

  // ---- Sidebar actions ----------------------------------------------------

  async function uploadFile(file: File): Promise<string> {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || "Upload failed");
    }
    const { url } = (await res.json()) as { url: string };
    return url;
  }

  // Persist the uploaded URL on stories.library_images so it survives layer
  // deletion. Mirrors the server response into local state. Non-fatal: if
  // the persist fails (table/column missing), the image still appears in
  // the sidebar for the current session via the optimistic update below.
  async function persistToLibrary(url: string) {
    setStory((prev) => {
      const existing = prev.library_images ?? [];
      if (existing.includes(url)) return prev;
      return { ...prev, library_images: [...existing, url] };
    });
    try {
      const res = await fetch(`/api/stories/${story.id}/library`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Library save failed");
      }
      const { libraryImages } = (await res.json()) as {
        libraryImages: string[];
      };
      setStory((prev) => ({ ...prev, library_images: libraryImages }));
    } catch (err) {
      console.error("[library] persist failed:", err);
      setSaveError(
        err instanceof Error
          ? err.message
          : "Couldn't save upload to library"
      );
    }
  }

  // Images tab upload: add to library only. The user drags or clicks a
  // thumbnail to actually place it on the page — upload should not move
  // the user off their current composition.
  async function handleUpload(file: File) {
    try {
      const url = await uploadFile(file);
      await persistToLibrary(url);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Upload failed");
    }
  }

  const resolvePick = useCallback(
    (url: string) => {
      if (!pickingLayerId) return;
      updateLayer(pickingLayerId, { src: url });
      setPickingLayerId(null);
    },
    [pickingLayerId, updateLayer]
  );

  async function handlePickerUpload(file: File): Promise<void> {
    try {
      const url = await uploadFile(file);
      // Persist to library first so the upload survives even if the user
      // later deletes the layer it fills. resolvePick then writes the URL
      // into the target image box the modal was opened for.
      await persistToLibrary(url);
      resolvePick(url);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Upload failed");
      setPickingLayerId(null);
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
      // Enqueue the Inngest job and poll it to completion. The route now
      // returns 202 with { jobId } instead of the regenerated text inline.
      const res = await fetch(
        `/api/stories/${story.id}/pages/${currentPage.pageNumber}/regenerate-text`,
        { method: "POST" }
      );
      if (!res.ok && res.status !== 202) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Regeneration failed");
      }
      const { jobId } = (await res.json()) as { jobId: string };
      const { text } = await pollJob<{ text: string }>(jobId);

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
  const dirtyPageCount = story.pages.reduce(
    (n, p) => (dirty[p.pageNumber] ? n + 1 : n),
    0
  );

  const selectedIsLayoutText = useMemo(
    () =>
      selectedLayer?.source === "layout" && selectedLayer?.type === "text",
    [selectedLayer]
  );

  // Living vs memorial re-tints all accent surfaces. Forest is the
  // default living accent; indigo is calmer for memorial stories.
  // Resolved against the palette tokens added in globals.css.
  const isMemorial = pet?.mode === "memorial";
  const accent = isMemorial
    ? "var(--color-indigo-500)"
    : "var(--color-forest-500)";

  // Floating AI dock visibility — when the user opens the assistant from a
  // suggestion or the FAB. Sits position:fixed at bottom-right so it never
  // competes with the canvas for horizontal space.
  const [aiDockOpen, setAiDockOpen] = useState(false);

  // Layout descriptions for the 2-col grid in the Layouts tab. The Layout
  // type itself has no description field (it's a pure region spec) so we
  // co-locate the human copy here. Keyed by layout id.
  const LAYOUT_DESCRIPTIONS: Record<string, string> = {
    "top-image-bottom-text": "⅔ image, ⅓ text below",
    "full-bleed-caption": "Illustration fills the page",
    "side-by-side": "Image left, text right",
    "corner-caption": "Small caption tucked in a corner",
    "pet-portrait": "Centered portrait with caption",
    "in-loving-memory": "Soft frame · name + dates",
    "photo-strip": "Three photos + long caption",
    "quote-spread": "Image left, pull-quote right",
  };

  // Inspector idle-state quick prompts. These open the AI dock; the prompt
  // is for inspiration — the user still types into the dock themselves so
  // the actual generate is intentional.
  const AI_SUGGESTIONS = [
    "Make the morning light warmer",
    "Rewrite paragraph in shorter sentences",
    "Add a butterfly somewhere subtle",
    "Match illustration to page 1",
  ];

  const lastSaved = useMemo(() => {
    // We don't track per-page save timestamps server-side, so fall back to
    // a stable "draft" / "dirty" / "saved just now" indicator that mirrors
    // what the user actually cares about: is anything unsaved.
    if (saving) return "saving…";
    if (dirtyPageCount > 0)
      return dirtyPageCount === 1
        ? "1 page unsaved"
        : `${dirtyPageCount} pages unsaved`;
    return "all changes saved";
  }, [saving, dirtyPageCount]);

  return (
    <>
      {/* The Studio is height-constrained to the viewport (minus the
          fixed 64px Navbar) so the side panels can scroll internally
          without pushing the canvas down. Per-panel scroll containers
          below have `overflow-y-auto`. The phone fallback lives in the
          outer <CanvasEditor> gate; below md this component never
          mounts. Tablet uses a narrower 3-col grid; desktop uses the
          original spec. */}
      <div className="mx-auto flex h-[calc(100vh-4rem)] max-w-[1440px] flex-col gap-3 overflow-hidden px-4 py-3 lg:px-6">
      {/* Story header — breadcrumb, title, meta on the left; history +
          save controls on the right. Sized to feel like a chapter
          opener, not a toolbar. */}
      <header className="flex flex-wrap items-end justify-between gap-4 px-1 pb-1">
        <div className="min-w-0">
          <Link
            href="/canvas"
            className="text-[11px] font-medium text-stone-500 transition-colors hover:text-sage-700"
          >
            ← All stories &nbsp;·&nbsp; Studio
          </Link>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <h1 className="font-[family-name:var(--font-display)] text-[32px] font-semibold leading-tight tracking-tight text-bark-900">
              {story.title}
            </h1>
            <span className="text-xs text-stone-500">
              {story.pages.length} pages &nbsp;·&nbsp; draft &nbsp;·&nbsp; {lastSaved}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {saveError && (
            <span className="text-xs font-medium text-clay-500">{saveError}</span>
          )}
          <button
            type="button"
            onClick={handleUndo}
            disabled={!history.canUndo}
            title="Undo (⌘Z)"
            aria-label="Undo"
            className="flex h-[34px] w-[34px] items-center justify-center rounded-full border border-linen-200 bg-paper text-sage-700 transition-colors hover:border-stone-500/30 disabled:cursor-not-allowed disabled:text-stone-500/30 disabled:hover:border-linen-200"
          >
            <Undo2 size={14} strokeWidth={1.75} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={handleRedo}
            disabled={!history.canRedo}
            title="Redo (⌘⇧Z)"
            aria-label="Redo"
            className="flex h-[34px] w-[34px] items-center justify-center rounded-full border border-linen-200 bg-paper text-sage-700 transition-colors hover:border-stone-500/30 disabled:cursor-not-allowed disabled:text-stone-500/30 disabled:hover:border-linen-200"
          >
            <Redo2 size={14} strokeWidth={1.75} aria-hidden="true" />
          </button>
          {/* "Save page" — outline pill, accent-tinted. The secondary action. */}
          <button
            type="button"
            onClick={savePage}
            disabled={saving || !isDirty}
            style={{ borderColor: accent, color: accent }}
            className="rounded-full border bg-paper px-4 py-2 text-[13px] font-semibold transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save page"}
          </button>
          {/* "Save all" — filled accent pill. The primary action. */}
          <button
            type="button"
            onClick={saveAllPages}
            disabled={saving || dirtyPageCount < 1}
            title={
              dirtyPageCount < 1
                ? "Nothing to save"
                : `Save ${dirtyPageCount} ${dirtyPageCount === 1 ? "page" : "pages"}`
            }
            style={{ background: accent }}
            className="rounded-full px-4 py-2 text-[13px] font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving
              ? "Saving…"
              : dirtyPageCount > 1
              ? `Save all (${dirtyPageCount})`
              : "Save all"}
          </button>
        </div>
      </header>

      {/* Workspace — fixed-width side rails so the canvas sits perfectly
          centred. `min-h-0` lets the children's `overflow-y-auto`
          actually engage (otherwise flex children default to their
          content height and the page grows instead of the panel
          scrolling). */}
      <div className="grid min-h-0 flex-1 grid-cols-[240px_minmax(0,1fr)_280px] gap-3 md:gap-[14px] lg:grid-cols-[290px_minmax(0,1fr)_334px] lg:gap-[18px]">
        {/* Left: tools sidebar */}
        <aside className="flex flex-col overflow-hidden rounded-[10px] border border-linen-200 bg-cream-50 p-4">
          <div className="mb-3 flex flex-wrap items-center gap-1">
            {(
              [
                "layouts",
                "text",
                "shapes",
                "images",
              ] as Exclude<SidebarTab, "assistant">[]
            ).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                style={
                  tab === t
                    ? { background: "var(--color-bark-900)", color: "var(--color-cream-50)" }
                    : undefined
                }
                className={`rounded-full px-3 py-[7px] text-[11px] font-semibold uppercase tracking-[.10em] transition-colors ${
                  tab === t ? "" : "text-sage-700 hover:bg-cream-200"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            {tab === "layouts" && !defineMode && (
              <div>
                <div className="mb-2 text-[10px] font-medium uppercase tracking-[.16em] text-stone-500">
                  Apply to
                </div>
                <div
                  role="radiogroup"
                  aria-label="Layout apply scope"
                  className="mb-4 flex rounded-lg border border-linen-200 bg-paper p-0.5"
                >
                  {/* Order matches default: "This page" is the safe
                      action and ships first; "All pages" is the
                      deliberate batch operation that requires an
                      extra click. */}
                  <button
                    type="button"
                    role="radio"
                    aria-checked={layoutScope === "page"}
                    onClick={() => setLayoutScope("page")}
                    style={layoutScope === "page" ? { color: accent } : undefined}
                    className={`flex-1 rounded-md px-2 py-1 text-[11px] font-semibold transition-colors ${
                      layoutScope === "page"
                        ? "bg-cream-50 shadow-sm"
                        : "text-stone-500 hover:text-sage-700"
                    }`}
                  >
                    This page
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={layoutScope === "all"}
                    onClick={() => setLayoutScope("all")}
                    style={layoutScope === "all" ? { color: accent } : undefined}
                    className={`flex-1 rounded-md px-2 py-1 text-[11px] font-semibold transition-colors ${
                      layoutScope === "all"
                        ? "bg-cream-50 shadow-sm"
                        : "text-stone-500 hover:text-sage-700"
                    }`}
                  >
                    All pages
                  </button>
                </div>

                {/* Built-in presets as a 2-col grid of cards — thumbnail
                    on top, name + one-line description below. */}
                <div className="grid grid-cols-2 gap-2.5">
                  {visibleBuiltinLayouts.map((l) => {
                    const isActive = currentLayoutId === l.id;
                    return (
                      <button
                        key={l.id}
                        type="button"
                        onClick={() => applyLayout(l.id)}
                        style={
                          isActive
                            ? {
                                outline: `2px solid ${accent}`,
                                outlineOffset: -1,
                                background: "var(--color-paper)",
                              }
                            : undefined
                        }
                        className={`overflow-hidden rounded-md p-2 text-left transition-colors ${
                          isActive
                            ? ""
                            : "border border-linen-200 bg-cream-50 hover:bg-cream-100"
                        }`}
                      >
                        <LayoutThumbnail layout={l} />
                        <div className="mt-2 text-[11px] font-semibold leading-tight text-bark-900">
                          {l.name}
                        </div>
                        <div className="mt-0.5 text-[10px] leading-tight text-stone-500">
                          {LAYOUT_DESCRIPTIONS[l.id] ?? ""}
                        </div>
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={startDefineLayout}
                  style={{ borderColor: accent, color: accent }}
                  className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed bg-transparent px-3 py-2.5 text-[12px] font-medium transition-opacity hover:opacity-80"
                >
                  ＋ Save current as preset
                </button>

                {customLayouts.length > 0 && (
                  <>
                    <div className="mt-4 mb-2 text-[10px] font-medium uppercase tracking-[.16em] text-stone-500">
                      Your layouts
                    </div>
                    <div className="grid grid-cols-2 gap-2.5">
                      {customLayouts.map((l) => {
                        const isActive = currentLayoutId === l.id;
                        return (
                          <button
                            key={l.id}
                            type="button"
                            onClick={() => applyLayout(l.id)}
                            style={
                              isActive
                                ? {
                                    outline: `2px solid ${accent}`,
                                    outlineOffset: -1,
                                    background: "var(--color-paper)",
                                  }
                                : undefined
                            }
                            className={`overflow-hidden rounded-md p-2 text-left transition-colors ${
                              isActive
                                ? ""
                                : "border border-linen-200 bg-cream-50 hover:bg-cream-100"
                            }`}
                          >
                            <LayoutThumbnail layout={l} />
                            <div className="mt-2 truncate text-[11px] font-semibold text-bark-900">
                              {l.name}
                            </div>
                            <div className="mt-0.5 text-[10px] text-stone-500">
                              {l.scope === "global" ? "All books" : "This book"}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            )}

            {tab === "layouts" && defineMode && (
              <DefineLayoutForm
                name={defineName}
                onNameChange={setDefineName}
                scope={defineScope}
                onScopeChange={setDefineScope}
                imageCount={defineMode.imageRects.length}
                textCount={defineMode.textRects.length}
                onAddImage={addDefineImageBox}
                onAddText={addDefineTextBox}
                pending={saveLayoutPending}
                error={saveLayoutError}
                onCancel={cancelDefineLayout}
                onSave={saveCustomLayout}
              />
            )}

            {tab === "text" && (
              <div>
                <div className="mb-2.5 text-[10px] font-medium uppercase tracking-[.16em] text-stone-500">
                  Add text
                </div>
                <div className="flex flex-col gap-2">
                  {TEXT_PRESETS.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() =>
                        addLayer(
                          makeText({
                            text: p.label,
                            fontSize: p.fontSize,
                            fontWeight: p.fontWeight,
                            fontFamily: p.fontFamily,
                          })
                        )
                      }
                      className="flex w-full items-baseline justify-between rounded-lg border border-linen-200 bg-paper px-3 py-2.5 text-left transition-colors hover:bg-cream-50"
                    >
                      <span
                        style={{
                          fontFamily: p.fontFamily,
                          fontWeight:
                            p.fontWeight === "bold" ? 600 : 500,
                          // Cap rendered preview size so all three rows
                          // stay roughly the same vertical rhythm
                          fontSize: Math.min(p.fontSize, 22),
                          color: "var(--color-bark-900)",
                        }}
                      >
                        {p.label}
                      </span>
                      <span className="text-[10px] text-stone-500">
                        {p.fontSize}px
                      </span>
                    </button>
                  ))}
                </div>

                <div className="mt-5 mb-2.5 text-[10px] font-medium uppercase tracking-[.16em] text-stone-500">
                  Story fonts
                </div>
                <div className="flex flex-col gap-2">
                  {STORY_FONTS.map((f) => (
                    <button
                      key={f.label}
                      type="button"
                      onClick={() => {
                        // If a text layer is selected, retypeset it.
                        // Otherwise add a new 18px sample in that family.
                        if (selectedLayer && selectedLayer.type === "text") {
                          updateLayer(selectedLayer.id, {
                            fontFamily: f.family,
                          });
                        } else {
                          addLayer(
                            makeText({
                              text: f.label,
                              fontSize: 18,
                              fontWeight: "normal",
                              fontFamily: f.family,
                            })
                          );
                        }
                      }}
                      className="w-full rounded-lg border border-linen-200 bg-paper px-3 py-2.5 text-left text-[13px] text-bark-900 transition-colors hover:bg-cream-50"
                      style={{ fontFamily: f.family }}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
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

            {tab === "images" && (
              <ImagesPanel
                story={story}
                onAddImageBox={() => addLayer(makeImageBox())}
                onUpload={handleUpload}
                onInsertImage={(url) => addLayer(makeUploadImage(url))}
              />
            )}
          </div>
        </aside>

        {/* Center: canvas. Plain frame, no surrounding panel — the page
            sits directly on the body so it reads as a single sheet.
            `min-h-0` lets the parent grid constrain this column's
            height; the canvas itself uses `aspect-square` against the
            smaller dimension so it stays visually a page no matter the
            viewport. */}
        <div className="flex min-h-0 min-w-0 flex-col items-center justify-center gap-2 py-1">
          {defineMode && (
            <div className="w-full max-w-[640px] rounded-lg border border-linen-200 bg-cream-100 px-4 py-1.5 text-center text-[11px] font-medium text-moss-700">
              Drag and resize the boxes to design your layout
            </div>
          )}
          <div
            ref={canvasRef}
            // tabIndex makes the canvas keyboard-focusable so screen-
            // reader / keyboard users have a reachable surface. The
            // focus-visible ring is the affordance — same moss-700
            // tint the rest of the studio uses for selection.
            tabIndex={0}
            aria-label="Story page canvas"
            // `max-w` AND `max-h` cap on both axes so the square always
            // fits in whatever the smaller dimension is. `min(...)` so
            // it doesn't have to grow to fill — keeps the page centered
            // in the column with breathing room.
            className="relative aspect-square shrink overflow-hidden rounded-[4px] bg-paper focus:outline-none focus-visible:ring-2 focus-visible:ring-moss-700 focus-visible:ring-offset-2"
            style={{
              width: "min(100%, 640px)",
              height: "min(100%, 640px)",
              maxWidth: "min(100%, 640px)",
              maxHeight: "min(100%, 640px)",
              boxShadow:
                "0 24px 48px -16px rgba(30,20,10,.25), 0 2px 6px rgba(30,20,10,.08)",
            }}
            onPointerDown={() => {
              if (defineMode) {
                setDefineMode((m) => (m ? { ...m, active: null } : m));
                return;
              }
              setSelectedId(null);
              setEditingTextId(null);
            }}
          >
            {/* Page layers. Dimmed while the user is defining a new layout
                so the two design rectangles read as the foreground. */}
            <div
              className={
                defineMode
                  ? "pointer-events-none opacity-30 transition-opacity"
                  : "contents"
              }
            >
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
                  onDoubleClickText={() => {
                    // Snapshot once at edit start so the whole typing
                    // session is a single undo step.
                    snapshotPages();
                    setEditingTextId(layer.id);
                  }}
                  onBlurText={() => setEditingTextId(null)}
                  onImageDrop={(src) => updateLayer(layer.id, { src })}
                  onChooseImage={() => setPickingLayerId(layer.id)}
                />
              ))}
            </div>

            {defineMode && (
              <>
                {defineMode.imageRects.map((rect, i) => (
                  <DefineRect
                    key={`image-${i}`}
                    kind="image"
                    rect={rect}
                    index={i}
                    total={defineMode.imageRects.length}
                    active={
                      defineMode.active?.kind === "image" &&
                      defineMode.active.index === i
                    }
                    canvasRef={canvasRef}
                    onActivate={() =>
                      setDefineMode((m) =>
                        m ? { ...m, active: { kind: "image", index: i } } : m
                      )
                    }
                    onChange={(r) =>
                      setDefineMode((m) =>
                        m
                          ? {
                              ...m,
                              imageRects: m.imageRects.map((x, j) =>
                                j === i ? r : x
                              ),
                            }
                          : m
                      )
                    }
                    onRemove={
                      defineMode.imageRects.length > 1
                        ? () => removeDefineBox("image", i)
                        : undefined
                    }
                  />
                ))}
                {defineMode.textRects.map((rect, i) => (
                  <DefineRect
                    key={`text-${i}`}
                    kind="text"
                    rect={rect}
                    index={i}
                    total={defineMode.textRects.length}
                    active={
                      defineMode.active?.kind === "text" &&
                      defineMode.active.index === i
                    }
                    canvasRef={canvasRef}
                    onActivate={() =>
                      setDefineMode((m) =>
                        m ? { ...m, active: { kind: "text", index: i } } : m
                      )
                    }
                    onChange={(r) =>
                      setDefineMode((m) =>
                        m
                          ? {
                              ...m,
                              textRects: m.textRects.map((x, j) =>
                                j === i ? r : x
                              ),
                            }
                          : m
                      )
                    }
                    onRemove={
                      defineMode.textRects.length > 1
                        ? () => removeDefineBox("text", i)
                        : undefined
                    }
                  />
                ))}
              </>
            )}
            {/* Page-number indicator — bottom-right of the canvas, like a
                printed page foot. Tabular-nums so the digits don't dance
                as the user pages through the story. */}
            {currentPage && !defineMode && (
              <div
                className="pointer-events-none absolute bottom-3 right-3.5 font-[family-name:var(--font-sans)] text-[10px] uppercase tracking-[.16em] text-stone-500"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {String(currentPage.pageNumber).padStart(2, "0")} /{" "}
                {String(story.pages.length).padStart(2, "0")}
              </div>
            )}
          </div>
        </div>

        {/* Right: contextual inspector. When a layer is selected we show
            its properties; otherwise we show a "This page" overview —
            quote, meta table, and a handful of quick-prompt suggestions
            that open the floating AI dock. The full assistant lives in
            the floating dock at bottom-right, not inside this panel. */}
        <aside className="flex flex-col overflow-hidden rounded-[10px] border border-linen-200 bg-cream-50 p-[18px]">
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            {selectedLayer ? (
              <PropertiesPanel
                layer={selectedLayer}
                showRegenerate={selectedIsLayoutText}
                regenPending={regenPending}
                onRegenerate={regenerateLayoutText}
                onChange={(patch) => updateLayer(selectedLayer.id, patch)}
                onDelete={() => deleteLayer(selectedLayer.id)}
              />
            ) : currentPage ? (
              <div>
                <div className="mb-2.5 text-[10px] font-medium uppercase tracking-[.16em] text-stone-500">
                  This page
                </div>
                <p className="font-[family-name:var(--font-display)] text-[16px] font-medium leading-snug text-bark-900">
                  &ldquo;
                  {(currentPage.text ?? "").slice(0, 90).trim()}
                  {(currentPage.text ?? "").length > 90 ? "…" : ""}&rdquo;
                </p>
                <dl className="mt-3.5 grid grid-cols-[auto_1fr] gap-x-3.5 gap-y-2 text-[12px]">
                  <dt className="text-stone-500">Layout</dt>
                  <dd className="text-bark-900">
                    {visibleBuiltinLayouts.find(
                      (l) => l.id === currentLayoutId
                    )?.name ??
                      customLayouts.find((l) => l.id === currentLayoutId)
                        ?.name ??
                      "—"}
                  </dd>
                  <dt className="text-stone-500">Layers</dt>
                  <dd className="text-bark-900">{layers.length}</dd>
                  <dt className="text-stone-500">Words</dt>
                  <dd className="text-bark-900">
                    {(currentPage.text ?? "")
                      .split(/\s+/)
                      .filter(Boolean)
                      .length}
                  </dd>
                  <dt className="text-stone-500">Page</dt>
                  <dd className="text-bark-900">
                    {currentPage.pageNumber} of {story.pages.length}
                  </dd>
                </dl>

                <div className="mt-5 mb-2 text-[10px] font-medium uppercase tracking-[.16em] text-stone-500">
                  Ask the assistant
                </div>
                <div className="flex flex-col gap-1.5">
                  {AI_SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setAiDockOpen(true)}
                      className="rounded-lg border border-linen-200 bg-paper px-3 py-2 text-left text-[12px] text-bark-900 transition-colors hover:bg-cream-50"
                    >
                      <span
                        aria-hidden="true"
                        style={{ color: accent }}
                        className="mr-2 font-semibold"
                      >
                        ✦
                      </span>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </aside>
      </div>

      {/* Pages rail — single horizontal strip across the bottom. Each
          thumbnail represents one page; pairs are grouped under a
          spread label (1·2, 3·4, …) so the user can navigate by
          spread the way the printed book reads. */}
      {/* Bottom filmstrip — one thumbnail per page, in order. Each
          thumb shows the page image (or a paper placeholder) and is
          captioned with its page number; the active page gets an
          accent outline. Horizontally scrollable. */}
      <footer
        className="flex shrink-0 items-center gap-2 overflow-x-auto rounded-[10px] border border-linen-200 bg-cream-50 px-[18px] py-3"
        style={{ minHeight: 96 }}
      >
        <span className="mr-2 shrink-0 text-[10px] font-medium uppercase tracking-[.16em] text-stone-500">
          Pages
        </span>
        {story.pages.map((page, idx) => {
          const isActive = page.pageNumber === currentPage?.pageNumber;
          const isDirtyPage = !!dirty[page.pageNumber];
          return (
            <div
              key={page.pageNumber}
              className="flex shrink-0 flex-col items-center"
            >
              <button
                type="button"
                onClick={() => {
                  setPageIdx(idx);
                  setSelectedId(null);
                  setEditingTextId(null);
                }}
                title={`Page ${page.pageNumber}`}
                className="relative overflow-hidden rounded-[3px] bg-paper transition-transform"
                style={{
                  width: 48,
                  height: 56,
                  boxShadow: "0 1px 2px rgba(40,30,20,.08)",
                  outline: isActive
                    ? `2px solid ${accent}`
                    : "1px solid var(--color-linen-200)",
                  outlineOffset: isActive ? 2 : 0,
                }}
              >
                {page.imageUrl ? (
                  page.imageUrl.startsWith("data:") ? (
                    // Data URLs (mid-upload drafts) bypass next/image
                    // — its loader requires a real URL. The persisted
                    // Supabase URL goes through the optimized path
                    // below once the upload finishes.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={page.imageUrl}
                      alt=""
                      className="absolute inset-0 h-full w-full object-cover opacity-90"
                    />
                  ) : (
                    <Image
                      src={page.imageUrl}
                      alt=""
                      fill
                      sizes="48px"
                      className="object-cover opacity-90"
                    />
                  )
                ) : null}
                {isDirtyPage && !isActive && (
                  <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-clay-500" />
                )}
              </button>
              <span
                className="mt-1 text-center text-[9px] uppercase tracking-[.04em]"
                style={{
                  color: isActive ? accent : "var(--color-stone-500)",
                  fontWeight: isActive ? 600 : 500,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {String(page.pageNumber).padStart(2, "0")}
              </span>
            </div>
          );
        })}
        <div className="flex-1" />
        <button
          type="button"
          disabled
          className="shrink-0 cursor-not-allowed rounded-lg border border-dashed border-linen-200 bg-transparent px-3 py-2 text-[11px] font-medium text-sage-700/60"
          title="Add page (coming soon)"
        >
          ＋ Add page
        </button>
      </footer>

      {/* Floating AI dock — collapsed pill that expands to a chat panel.
          Lives at bottom-right of the viewport so it doesn't compete
          with the canvas for horizontal space. */}
      {currentPage && (
        <div className="fixed bottom-5 right-5 z-30">
          {aiDockOpen ? (
            <div
              className="flex max-h-[520px] w-[300px] flex-col overflow-hidden rounded-2xl bg-paper lg:w-[360px]"
              style={{
                boxShadow:
                  "0 18px 40px rgba(30,20,10,.18), 0 0 0 1px var(--color-linen-200)",
              }}
            >
              <div className="flex items-center justify-between border-b border-linen-200 bg-cream-50 px-4 py-3">
                <div className="flex items-baseline gap-2">
                  <span style={{ color: accent }} className="text-base">
                    ✦
                  </span>
                  <span className="font-[family-name:var(--font-display)] text-[17px] font-semibold text-bark-900">
                    Assistant
                  </span>
                  <span className="text-[10px] font-medium uppercase tracking-[.08em] text-stone-500">
                    · page {currentPage.pageNumber}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setAiDockOpen(false)}
                  className="text-lg leading-none text-stone-500 hover:text-bark-900"
                  aria-label="Close assistant"
                >
                  ×
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-3">
                <AIAssistantPanel
                  storyId={story.id}
                  storyAiSystemPrompt={story.ai_system_prompt}
                  currentPage={currentPage}
                  onApplyText={applyAssistantText}
                  onApplyImage={applyAssistantImage}
                  onStoryPromptSaved={onStoryPromptSaved}
                />
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAiDockOpen(true)}
              style={{
                background: accent,
                boxShadow: "0 10px 24px rgba(30,20,10,.20)",
              }}
              className="inline-flex items-center gap-2 rounded-full px-5 py-3 text-[13px] font-semibold text-white"
            >
              <span aria-hidden="true">✦</span>
              Ask the assistant
            </button>
          )}
        </div>
      )}

      {pickingLayerId && (
        <ImagePickerModal
          story={story}
          onPick={resolvePick}
          onUpload={handlePickerUpload}
          onClose={() => setPickingLayerId(null)}
        />
      )}
    </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Inline icons used by the image upload + drop zones. Stroke-only,
// matches the rest of the redesigned site visual language.
function ImageDropIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="9" cy="9" r="1.5" />
      <path d="M21 15l-5-5L5 21" />
    </svg>
  );
}

function UploadIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M17 8l-5-5-5 5" />
      <path d="M12 3v12" />
    </svg>
  );
}

// LayoutThumbnail — tiny visual preview of a layout's image + text regions
// ---------------------------------------------------------------------------

function LayoutThumbnail({ layout }: { layout: Layout }) {
  const toPct = (v: number) => `${(v / CANVAS_SIZE) * 100}%`;
  return (
    <div className="relative h-10 w-10 flex-none overflow-hidden rounded border border-cream-300 bg-cream-200">
      <div
        className="absolute rounded-sm bg-cream-400"
        style={{
          left: toPct(layout.imageRegion.x),
          top: toPct(layout.imageRegion.y),
          width: toPct(layout.imageRegion.width),
          height: toPct(layout.imageRegion.height),
        }}
      />
      <div
        className="absolute rounded-sm bg-ink-700"
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
  onImageDrop: (src: string) => void;
  onChooseImage: () => void;
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
  onImageDrop,
  onChooseImage,
}: LayerViewProps) {
  const [dropActive, setDropActive] = useState(false);
  const isImage = layer.type === "image";

  const dragProps = isImage
    ? {
        onDragOver: (e: React.DragEvent) => {
          // Only accept drops carrying our in-app image mime.
          if (e.dataTransfer.types.includes(IMAGE_DRAG_MIME)) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
            if (!dropActive) setDropActive(true);
          }
        },
        onDragLeave: () => setDropActive(false),
        onDrop: (e: React.DragEvent) => {
          e.preventDefault();
          setDropActive(false);
          const src =
            e.dataTransfer.getData(IMAGE_DRAG_MIME) ||
            e.dataTransfer.getData("text/uri-list") ||
            e.dataTransfer.getData("text/plain");
          if (src) onImageDrop(src);
        },
      }
    : {};

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
    <div style={style} onPointerDown={onPointerDown} {...dragProps}>
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
      {layer.type === "image" && (
        <ImageLayerContent
          layer={layer}
          dropActive={dropActive}
          onChooseImage={onChooseImage}
        />
      )}

      {selected && (
        <>
          {/* Dashed selection outline (non-interactive). */}
          <div
            className="pointer-events-none absolute inset-0 border-2 border-dashed border-moss-700"
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
            className="pointer-events-none absolute top-1/2 h-6 w-2 -translate-y-1/2 rounded-full border-2 border-moss-700 bg-cream-50"
            style={{ right: -5, zIndex: 11 }}
          />
          <div
            className="pointer-events-none absolute top-1/2 h-6 w-2 -translate-y-1/2 rounded-full border-2 border-moss-700 bg-cream-50"
            style={{ left: -5, zIndex: 11 }}
          />
          <div
            className="pointer-events-none absolute left-1/2 h-2 w-6 -translate-x-1/2 rounded-full border-2 border-moss-700 bg-cream-50"
            style={{ bottom: -5, zIndex: 11 }}
          />
          <div
            className="pointer-events-none absolute left-1/2 h-2 w-6 -translate-x-1/2 rounded-full border-2 border-moss-700 bg-cream-50"
            style={{ top: -5, zIndex: 11 }}
          />

          {/* Southeast corner — both axes. Sits above the edge hit zones. */}
          <div
            onPointerDown={(e) => onStartResize(e, "se")}
            className="cursor-nwse-resize rounded-full border-2 border-moss-700 bg-cream-50"
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
            className="cursor-grab rounded-full border-2 border-moss-700 bg-cream-50"
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

function ImageLayerContent({
  layer,
  dropActive,
  onChooseImage,
}: {
  layer: ImageLayer;
  dropActive: boolean;
  onChooseImage: () => void;
}) {
  // Explicit fit wins (set by makeImageBox → cover). Otherwise fall back to
  // the old source-based default: layout-images cover, user-images contain.
  const fit =
    layer.fit ?? (layer.source === "layout" ? "cover" : "contain");

  // Empty image boxes show a drop target and a "Choose image" affordance
  // instead of a broken <img>. The outer wrapper stays pointer-events-none
  // so clicks fall through to the layer for drag/select; the button inside
  // is pointer-events-auto so clicking it opens the picker.
  if (!layer.src) {
    return (
      <div
        className={`pointer-events-none flex h-full w-full flex-col items-center justify-center rounded-xl border-2 border-dashed text-center ${
          dropActive
            ? "border-moss-700 bg-cream-200 text-moss-700"
            : "border-cream-400 bg-cream-100/60 text-ink-300"
        }`}
      >
        <ImageDropIcon />
        <span className="mt-1 px-2 text-[10px] font-black uppercase tracking-wider">
          {dropActive ? "Drop to place" : "Drop an image"}
        </span>
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onChooseImage();
          }}
          className="pointer-events-auto mt-2 rounded-full bg-cream-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-moss-700 shadow ring-1 ring-moss-200 hover:bg-cream-200"
        >
          Choose image
        </button>
      </div>
    );
  }

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
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
      {dropActive && (
        <div className="pointer-events-none absolute inset-0 rounded-xl border-4 border-dashed border-moss-700 bg-moss-700/10" />
      )}
    </>
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
  // Map raw layer type to a humane heading that matches the mockup
  // ("Story text" for a layout-bound caption, "Text" for a user layer,
  // "Shape" for primitives + icons).
  const headingType =
    layer.type === "text" && layer.source === "layout" ? "Story text" : layer.type;
  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between text-[11px] text-stone-500">
          <span>
            {layer.type}
            {layer.source === "layout" && " layer"}
          </span>
          <div className="flex items-center gap-3 text-[12px] font-medium">
            <button
              type="button"
              className="text-bark-900 hover:text-moss-700"
              title="Duplicate (not yet)"
              disabled
            >
              Duplicate
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="text-clay-500 hover:text-clay-500/80"
            >
              Delete
            </button>
          </div>
        </div>
        <h3 className="mt-1 font-[family-name:var(--font-display)] text-[22px] font-semibold capitalize text-bark-900">
          {headingType}
        </h3>
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
              className="w-full rounded-xl bg-gradient-to-r from-moss-700 to-moss-700 px-3 py-2 text-xs font-black uppercase text-cream-50 shadow-md disabled:cursor-wait disabled:opacity-60"
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
              className="w-full rounded-lg border-2 border-cream-300 bg-cream-200/40 px-2 py-1 text-xs font-medium text-ink-900"
            />
          </Field>
          <Field label="Font">
            <FontPicker
              value={layer.fontFamily}
              onChange={(family) =>
                (onChange as (p: Partial<TextLayer>) => void)({
                  fontFamily: family,
                })
              }
            />
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
              className="w-full rounded-lg border-2 border-cream-300 bg-cream-50 px-2 py-1 text-xs font-bold text-ink-900"
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
    <label className="flex items-center gap-1 rounded-lg border-2 border-cream-300 bg-cream-50 px-2 py-1">
      <span className="text-[10px] font-black uppercase text-ink-300">
        {label}
      </span>
      <input
        type="number"
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(n);
        }}
        className="w-full bg-transparent text-xs font-bold text-ink-900 outline-none"
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
      <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-ink-300">
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
          className="h-7 w-10 cursor-pointer rounded border border-cream-300"
        />
        <button
          type="button"
          onClick={() => onChange("transparent")}
          className="rounded-md border border-cream-300 px-2 py-0.5 text-[10px] font-black uppercase text-ink-300 hover:bg-cream-200"
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
            className="h-5 w-5 rounded border border-cream-300"
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
        className="w-full rounded-xl border-2 border-cream-300 bg-cream-200/40 px-3 py-2 text-xs font-bold text-ink-900 placeholder-ink-300 focus:border-moss-500 focus:outline-none"
      />

      <label className="flex w-full cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-cream-400 bg-cream-100/60 px-2 py-3 text-center text-[11px] font-black uppercase text-ink-500 hover:bg-moss-100">
        Upload custom SVG
        <span className="mt-0.5 text-[9px] font-medium normal-case text-ink-300">
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
            <p className="mb-1 px-1 text-[10px] font-black uppercase tracking-wider text-ink-300">
              Primitives
            </p>
            <div className="grid grid-cols-3 gap-1.5">
              {matchingPrimitives.map((p) => (
                <button
                  key={p.kind}
                  type="button"
                  onClick={() => onAddPrimitive(p.kind)}
                  title={p.name}
                  className="flex aspect-square items-center justify-center rounded-xl border-2 border-cream-300 bg-cream-50 text-xs font-black uppercase text-ink-500 hover:border-moss-500 hover:bg-cream-200"
                >
                  {p.kind === "rect" && (
                    <div className="h-7 w-7 rounded-md bg-cream-400" />
                  )}
                  {p.kind === "circle" && (
                    <div className="h-7 w-7 rounded-full bg-pink-300" />
                  )}
                  {p.kind === "line" && (
                    <div className="h-1 w-9 rounded-full bg-ink-700" />
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
              <p className="mb-1 px-1 text-[10px] font-black uppercase tracking-wider text-ink-300">
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
                <p className="mb-1 px-1 text-[10px] font-black uppercase tracking-wider text-ink-300">
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
        <p className="py-4 text-center text-[11px] font-medium text-ink-300">
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
      className="flex aspect-square items-center justify-center rounded-lg border border-cream-300 bg-cream-50 p-1.5 text-ink-500 transition-all hover:scale-105 hover:border-moss-500 hover:bg-cream-200"
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

// ---------------------------------------------------------------------------
// ImagesPanel — Images tab contents. Upload button, Add image box button,
// and a library of every image in the comic (generated page images plus
// any image layers the user has added). Library thumbnails are draggable
// onto image layers on the canvas.
// ---------------------------------------------------------------------------

interface ImagesPanelProps {
  story: Story;
  onAddImageBox: () => void;
  onUpload: (file: File) => void;
  onInsertImage: (url: string) => void;
}

// Collect every image URL referenced by the comic:
//  - stories.library_images (uploads — persist even when no layer uses them)
//  - page.imageUrl for each page (generated illustrations)
//  - any image layers the user has added
// Dedup by URL. Shared by the Images tab library and the picker modal.
function collectComicImages(
  story: Story
): { url: string; label: string }[] {
  const seen = new Set<string>();
  const out: { url: string; label: string }[] = [];

  for (const url of story.library_images ?? []) {
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push({ url, label: "Upload" });
  }
  for (const page of story.pages) {
    if (page.imageUrl && !seen.has(page.imageUrl)) {
      seen.add(page.imageUrl);
      out.push({ url: page.imageUrl, label: `Page ${page.pageNumber}` });
    }
    for (const layer of page.overlays ?? []) {
      if (layer.type !== "image") continue;
      if (!layer.src || seen.has(layer.src)) continue;
      seen.add(layer.src);
      out.push({ url: layer.src, label: "Added" });
    }
  }
  return out;
}

function ImagesPanel({
  story,
  onAddImageBox,
  onUpload,
  onInsertImage,
}: ImagesPanelProps) {
  const entries = useMemo(() => collectComicImages(story), [story]);

  return (
    <div className="space-y-3">
      <label className="flex w-full cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-cream-400 bg-cream-100/60 px-3 py-5 text-center text-xs font-bold text-ink-500 hover:bg-moss-100">
        <UploadIcon />
        <span className="mt-1">Upload image</span>
        <span className="mt-0.5 text-[10px] font-medium text-ink-300">
          PNG / JPG, max 5 MB
        </span>
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onUpload(f);
            e.target.value = "";
          }}
        />
      </label>

      <button
        type="button"
        onClick={onAddImageBox}
        className="flex w-full items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-cream-400 bg-cream-100/60 px-3 py-3 text-[11px] font-black uppercase text-ink-500 transition-all hover:border-moss-500 hover:bg-moss-100"
      >
        <span className="text-base leading-none">+</span>
        Add image box
      </button>

      <div>
        <div className="pb-1.5 text-[10px] font-black uppercase tracking-wider text-ink-300">
          In this comic ({entries.length})
        </div>
        {entries.length === 0 ? (
          <div className="rounded-xl border border-dashed border-cream-300 bg-cream-50 px-2 py-4 text-center text-[10px] font-bold text-ink-300">
            No images yet
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-1.5">
            {entries.map((entry) => (
              <LibraryThumb
                key={entry.url}
                url={entry.url}
                label={entry.label}
                onClick={() => onInsertImage(entry.url)}
              />
            ))}
          </div>
        )}
        <p className="mt-2 text-[10px] leading-snug text-ink-300">
          Drag a thumbnail onto an image box, or click to add it as a new
          layer.
        </p>
      </div>
    </div>
  );
}

function LibraryThumb({
  url,
  label,
  onClick,
}: {
  url: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "copy";
        e.dataTransfer.setData(IMAGE_DRAG_MIME, url);
        e.dataTransfer.setData("text/uri-list", url);
        e.dataTransfer.setData("text/plain", url);
      }}
      className="group relative aspect-square overflow-hidden rounded-xl border-2 border-cream-300 bg-cream-200 transition-all hover:border-moss-500 hover:shadow"
      title={label}
    >
      {url.startsWith("data:") ? (
        // Data URLs (in-flight uploads) skip next/image — its loader
        // requires a real URL.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={label}
          draggable={false}
          className="h-full w-full object-cover"
        />
      ) : (
        <Image
          src={url}
          alt={label}
          fill
          sizes="128px"
          draggable={false}
          className="object-cover"
        />
      )}
      <span className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-1.5 py-1 text-left text-[9px] font-black uppercase tracking-wider text-cream-50">
        {label}
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// ImagePickerModal — opened from an empty image box's "Choose image" button.
// Offers upload-from-computer and a grid of every image already in this
// comic. Picking a thumbnail or finishing an upload writes the src back to
// the originating image layer.
// ---------------------------------------------------------------------------

interface ImagePickerModalProps {
  story: Story;
  onPick: (url: string) => void;
  onUpload: (file: File) => Promise<void>;
  onClose: () => void;
}

function ImagePickerModal({
  story,
  onPick,
  onUpload,
  onClose,
}: ImagePickerModalProps) {
  const entries = useMemo(() => collectComicImages(story), [story]);
  const [uploading, setUploading] = useState(false);

  // Escape to close. Only one listener while the modal is mounted.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      await onUpload(file);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-3xl border-4 border-cream-300 bg-cream-50 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b-2 border-cream-300 px-5 py-3">
          <h2 className="font-[family-name:var(--font-display)] text-lg font-bold text-ink-900">
            Choose an image
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-ink-300 hover:bg-cream-200 hover:text-moss-700"
            title="Close"
          >
            &times;
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-5 py-4">
          <label className="flex w-full cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-cream-400 bg-cream-100/60 px-4 py-6 text-center text-sm font-bold text-ink-500 hover:bg-moss-100">
            <UploadIcon size={24} />
            <span className="mt-1">
              {uploading ? "Uploading…" : "Upload from your computer"}
            </span>
            <span className="mt-0.5 text-[11px] font-medium text-ink-300">
              PNG / JPG, max 5 MB
            </span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleUpload(f);
                e.target.value = "";
              }}
            />
          </label>

          <div>
            <div className="pb-2 text-[11px] font-black uppercase tracking-wider text-ink-300">
              From this comic ({entries.length})
            </div>
            {entries.length === 0 ? (
              <div className="rounded-xl border-2 border-dashed border-cream-300 bg-cream-200/40 px-3 py-6 text-center text-xs font-bold text-ink-300">
                No images in this comic yet.
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {entries.map((entry) => (
                  <button
                    key={entry.url}
                    type="button"
                    onClick={() => onPick(entry.url)}
                    className="group relative aspect-square overflow-hidden rounded-xl border-2 border-cream-300 bg-cream-200 transition-all hover:border-moss-500 hover:shadow-md"
                    title={entry.label}
                  >
                    {entry.url.startsWith("data:") ? (
                      // Data URLs skip next/image's loader.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={entry.url}
                        alt={entry.label}
                        draggable={false}
                        className="h-full w-full object-cover transition-transform group-hover:scale-105"
                      />
                    ) : (
                      <Image
                        src={entry.url}
                        alt={entry.label}
                        fill
                        sizes="(max-width: 640px) 33vw, 192px"
                        draggable={false}
                        className="object-cover transition-transform group-hover:scale-105"
                      />
                    )}
                    <span className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-1.5 py-1 text-left text-[10px] font-black uppercase tracking-wider text-cream-50">
                      {entry.label}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DefineRect — one draggable/resizable rectangle used while the user is
// designing a custom layout. Unlike LayerView it carries no layer state, only
// a Rect: callers own the Rect and receive updates via onChange. Supports
// move (on the body) and resize from N/S/E/W/SE handles.
// ---------------------------------------------------------------------------

type DefineResizeEdge = "n" | "s" | "e" | "w" | "se";

type DefineDrag =
  | { kind: "move"; startX: number; startY: number; orig: Rect }
  | {
      kind: "resize";
      edge: DefineResizeEdge;
      startX: number;
      startY: number;
      orig: Rect;
    };

interface DefineRectProps {
  kind: "image" | "text";
  rect: Rect;
  index: number;
  total: number;
  active: boolean;
  canvasRef: React.RefObject<HTMLDivElement | null>;
  onActivate: () => void;
  onChange: (next: Rect) => void;
  onRemove?: () => void;
}

function DefineRect({
  kind,
  rect,
  index,
  total,
  active,
  canvasRef,
  onActivate,
  onChange,
  onRemove,
}: DefineRectProps) {
  const [drag, setDrag] = useState<DefineDrag | null>(null);

  const toPct = (v: number) => `${(v / CANVAS_SIZE) * 100}%`;
  const scale = () => {
    const r = canvasRef.current?.getBoundingClientRect();
    if (!r || r.width === 0) return 1;
    return CANVAS_SIZE / r.width;
  };

  const beginMove = (e: React.PointerEvent) => {
    e.stopPropagation();
    onActivate();
    setDrag({ kind: "move", startX: e.clientX, startY: e.clientY, orig: rect });
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const beginResize = (e: React.PointerEvent, edge: DefineResizeEdge) => {
    e.stopPropagation();
    onActivate();
    setDrag({
      kind: "resize",
      edge,
      startX: e.clientX,
      startY: e.clientY,
      orig: rect,
    });
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };

  useEffect(() => {
    if (!drag) return;
    function onMove(e: PointerEvent) {
      if (!drag) return;
      const s = scale();
      const dx = (e.clientX - drag.startX) * s;
      const dy = (e.clientY - drag.startY) * s;
      if (drag.kind === "move") {
        // Clamp within the canvas so the rect can't slide out of view.
        const maxX = CANVAS_SIZE - drag.orig.width;
        const maxY = CANVAS_SIZE - drag.orig.height;
        onChange({
          x: Math.max(0, Math.min(maxX, drag.orig.x + dx)),
          y: Math.max(0, Math.min(maxY, drag.orig.y + dy)),
          width: drag.orig.width,
          height: drag.orig.height,
        });
      } else {
        let { x, y, width, height } = drag.orig;
        const MIN = 40;
        if (drag.edge === "e" || drag.edge === "se") {
          const maxW = CANVAS_SIZE - drag.orig.x;
          width = Math.max(MIN, Math.min(maxW, drag.orig.width + dx));
        }
        if (drag.edge === "s" || drag.edge === "se") {
          const maxH = CANVAS_SIZE - drag.orig.y;
          height = Math.max(MIN, Math.min(maxH, drag.orig.height + dy));
        }
        if (drag.edge === "w") {
          const maxW = drag.orig.x + drag.orig.width;
          width = Math.max(MIN, Math.min(maxW, drag.orig.width - dx));
          x = drag.orig.x + drag.orig.width - width;
        }
        if (drag.edge === "n") {
          const maxH = drag.orig.y + drag.orig.height;
          height = Math.max(MIN, Math.min(maxH, drag.orig.height - dy));
          y = drag.orig.y + drag.orig.height - height;
        }
        onChange({ x, y, width, height });
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

  const isImage = kind === "image";
  const bodyBg = isImage ? "bg-moss-200/40" : "bg-gold-300/35";
  const borderColor = isImage ? "border-moss-700" : "border-moss-700";
  const baseLabel = isImage ? "Image" : "Text";
  // Only number boxes when there's more than one of the kind.
  const label = total > 1 ? `${baseLabel} ${index + 1}` : baseLabel;
  const handleColor = isImage ? "bg-cream-50" : "bg-cream-50";

  return (
    <div
      onPointerDown={beginMove}
      style={{
        position: "absolute",
        left: toPct(rect.x),
        top: toPct(rect.y),
        width: toPct(rect.width),
        height: toPct(rect.height),
      }}
      className={`cursor-move select-none border-2 border-dashed ${borderColor} ${bodyBg} ${
        active ? "ring-2 ring-offset-2 ring-offset-white" : ""
      } ${active ? (isImage ? "ring-moss-500" : "ring-pink-400") : ""}`}
    >
      <div
        className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-cream-50 ${handleColor}`}
      >
        {label}
      </div>

      {active && onRemove && (
        <button
          type="button"
          onPointerDown={(e) => {
            // Keep the pointer event from starting a move on the body div.
            e.stopPropagation();
          }}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-cream-50 text-[13px] font-black leading-none text-rose-500 shadow ring-1 ring-rose-200 hover:bg-rose-50"
          title="Remove box"
        >
          &times;
        </button>
      )}

      {/* Edge handles. Positioned at the midpoint of each side. */}
      <Handle
        color={handleColor}
        cursor="ew-resize"
        style={{ left: "-6px", top: "50%", transform: "translate(-50%, -50%)" }}
        onPointerDown={(e) => beginResize(e, "w")}
      />
      <Handle
        color={handleColor}
        cursor="ew-resize"
        style={{ right: "-6px", top: "50%", transform: "translate(50%, -50%)" }}
        onPointerDown={(e) => beginResize(e, "e")}
      />
      <Handle
        color={handleColor}
        cursor="ns-resize"
        style={{ top: "-6px", left: "50%", transform: "translate(-50%, -50%)" }}
        onPointerDown={(e) => beginResize(e, "n")}
      />
      <Handle
        color={handleColor}
        cursor="ns-resize"
        style={{
          bottom: "-6px",
          left: "50%",
          transform: "translate(-50%, 50%)",
        }}
        onPointerDown={(e) => beginResize(e, "s")}
      />
      <Handle
        color={handleColor}
        cursor="nwse-resize"
        style={{
          right: "-6px",
          bottom: "-6px",
          transform: "translate(50%, 50%)",
        }}
        onPointerDown={(e) => beginResize(e, "se")}
      />
    </div>
  );
}

function Handle({
  color,
  cursor,
  style,
  onPointerDown,
}: {
  color: string;
  cursor: string;
  style: React.CSSProperties;
  onPointerDown: (e: React.PointerEvent) => void;
}) {
  return (
    <div
      onPointerDown={onPointerDown}
      style={{ ...style, cursor }}
      className={`absolute h-3 w-3 rounded-full border-2 border-white shadow ${color}`}
    />
  );
}

// ---------------------------------------------------------------------------
// DefineLayoutForm — sidebar form shown while define-mode is on. Takes name +
// scope and persists via /api/custom-layouts on Save.
// ---------------------------------------------------------------------------

interface DefineLayoutFormProps {
  name: string;
  onNameChange: (v: string) => void;
  scope: "story" | "global";
  onScopeChange: (s: "story" | "global") => void;
  imageCount: number;
  textCount: number;
  onAddImage: () => void;
  onAddText: () => void;
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onSave: () => void;
}

function DefineLayoutForm({
  name,
  onNameChange,
  scope,
  onScopeChange,
  imageCount,
  textCount,
  onAddImage,
  onAddText,
  pending,
  error,
  onCancel,
  onSave,
}: DefineLayoutFormProps) {
  return (
    <div className="space-y-3">
      <div className="rounded-2xl border-2 border-cream-300 bg-cream-100/60 px-3 py-3">
        <div className="text-[11px] font-black uppercase tracking-wider text-ink-500">
          Design mode
        </div>
        <p className="mt-1 text-[11px] leading-snug text-ink-300">
          Drag the purple (image) and pink (text) boxes on the canvas. Click
          a box and press &times; to remove. Add more below.
        </p>
      </div>

      <div className="space-y-1.5">
        <button
          type="button"
          onClick={onAddImage}
          className="flex w-full items-center justify-between rounded-xl border-2 border-cream-300 bg-cream-50 px-3 py-2 text-[11px] font-black uppercase text-moss-700 transition-all hover:border-moss-500 hover:bg-cream-200"
        >
          <span>+ Image box</span>
          <span className="rounded-full bg-moss-100 px-1.5 py-0.5 text-[10px] text-ink-500">
            {imageCount}
          </span>
        </button>
        <button
          type="button"
          onClick={onAddText}
          className="flex w-full items-center justify-between rounded-xl border-2 border-cream-300 bg-cream-50 px-3 py-2 text-[11px] font-black uppercase text-ink-900 transition-all hover:border-ink-700 hover:bg-cream-200"
        >
          <span>+ Text box</span>
          <span className="rounded-full bg-cream-300 px-1.5 py-0.5 text-[10px] text-ink-500">
            {textCount}
          </span>
        </button>
      </div>

      <label className="block">
        <span className="text-[10px] font-black uppercase tracking-wider text-ink-300">
          Name
        </span>
        <input
          type="text"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="My layout"
          maxLength={60}
          className="mt-1 w-full rounded-xl border-2 border-cream-300 bg-cream-50 px-2.5 py-1.5 text-sm font-bold text-ink-900 outline-none focus:border-moss-500"
        />
      </label>

      <fieldset className="space-y-1.5">
        <legend className="text-[10px] font-black uppercase tracking-wider text-ink-300">
          Save for
        </legend>
        <label className="flex cursor-pointer items-center gap-2 rounded-xl border-2 border-cream-300 bg-cream-50 px-2.5 py-2 hover:border-cream-400">
          <input
            type="radio"
            name="layout-scope"
            value="story"
            checked={scope === "story"}
            onChange={() => onScopeChange("story")}
            className="accent-moss-700"
          />
          <span className="text-xs font-bold text-moss-700">
            Just this book
          </span>
        </label>
        <label className="flex cursor-pointer items-center gap-2 rounded-xl border-2 border-cream-300 bg-cream-50 px-2.5 py-2 hover:border-cream-400">
          <input
            type="radio"
            name="layout-scope"
            value="global"
            checked={scope === "global"}
            onChange={() => onScopeChange("global")}
            className="accent-moss-700"
          />
          <span className="text-xs font-bold text-moss-700">
            All my books
          </span>
        </label>
      </fieldset>

      {error && (
        <div className="rounded-xl bg-rose-50 px-2.5 py-2 text-[11px] font-bold text-rose-500">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          onClick={onSave}
          disabled={pending}
          className="rounded-2xl bg-gradient-to-r from-moss-700 to-moss-700 px-3 py-2 text-xs font-black text-cream-50 shadow-md shadow-cream-300 transition-all hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
        >
          {pending ? "Saving..." : "Save layout"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="rounded-2xl border-2 border-cream-300 bg-cream-50 px-3 py-2 text-xs font-black text-ink-500 transition-all hover:bg-cream-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FontPicker — replaces the native <select> in the text-layer panel so we
// can render each option in its own font face. 50+ Google fonts is too
// many for a flat dropdown; we group by category (sans / serif / display
// / handwriting / mono) and let the user scroll.
//
// The popover is anchored below the trigger and closes on outside click,
// Escape, or selection. Trigger label renders the currently-selected
// font's name in that font.
// ---------------------------------------------------------------------------

function FontPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (family: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // The current value may be a stored font-family string from a legacy
  // layer that doesn't match anything in our registry. Render it as
  // "Custom font" so the picker still shows something sensible — the
  // user can pick a registered font to replace it.
  const current = findFontByFamily(value);
  const displayLabel = current?.label ?? "Custom font";
  const displayFamily = current?.family ?? value;

  // Close on outside click + Escape.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Group registry options by category once.
  const grouped = useMemo(() => {
    const out: Record<FontCategory, FontOption[]> = {
      sans: [],
      serif: [],
      display: [],
      handwriting: [],
      mono: [],
    };
    for (const f of FONT_OPTIONS) out[f.category].push(f);
    return out;
  }, []);

  function handleSelect(family: string) {
    onChange(family);
    setOpen(false);
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-lg border-2 border-cream-300 bg-cream-50 px-2 py-1.5 text-left text-xs text-ink-900 transition-colors hover:border-cream-400"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span
          className="truncate text-sm"
          style={{ fontFamily: displayFamily, fontWeight: 500 }}
        >
          {displayLabel}
        </span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          aria-hidden="true"
          className="ml-2 shrink-0 text-ink-500"
        >
          <path
            d="M2 4l3 3 3-3"
            stroke="currentColor"
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        <div
          className="animate-fade-in absolute left-0 right-0 top-full z-30 mt-1 max-h-[360px] overflow-y-auto rounded-xl border border-cream-300 bg-cream-50 shadow-[0_18px_40px_rgba(14,26,43,0.16)]"
          role="listbox"
        >
          {FONT_CATEGORY_ORDER.map((cat) => {
            const opts = grouped[cat];
            if (opts.length === 0) return null;
            return (
              <div key={cat} className="py-2">
                <div className="px-3 pb-1 text-[10px] font-medium uppercase tracking-[0.18em] text-ink-300">
                  {FONT_CATEGORY_LABELS[cat]}
                </div>
                <div>
                  {opts.map((f) => {
                    const active = f.family === value;
                    return (
                      <button
                        key={f.family}
                        type="button"
                        role="option"
                        aria-selected={active}
                        onClick={() => handleSelect(f.family)}
                        className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-base transition-colors ${
                          active
                            ? "bg-moss-100 text-ink-900"
                            : "text-ink-700 hover:bg-cream-200"
                        }`}
                        style={{ fontFamily: f.family }}
                      >
                        <span className="truncate">{f.label}</span>
                        {active && (
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 12 12"
                            aria-hidden="true"
                            className="ml-2 shrink-0 text-moss-700"
                          >
                            <path
                              d="M2 6l3 3 5-6"
                              stroke="currentColor"
                              strokeWidth="1.8"
                              fill="none"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Sub-md (phones) the Studio is unusable — the 3-column workspace
// can't render meaningfully in 343px of horizontal space. Show a
// centered notice card with a fallback CTA to the read view.
// Hidden at md+ so the editor takes over.
function StudioMobileNotice({ storyId }: { storyId: string }) {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md flex-col items-center justify-center gap-4 px-4 py-10 text-center md:hidden">
      <div className="w-full rounded-3xl border border-linen-200 bg-cream-50 p-6 shadow-sm">
        <span className="font-[family-name:var(--font-display)] text-[11px] font-medium uppercase tracking-[0.3em] text-sage-700">
          Studio
        </span>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-2xl font-semibold leading-snug tracking-tight text-bark-900">
          The Studio needs a larger screen.
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-stone-500">
          Open this story on a tablet (iPad) or desktop to edit
          pages. You can still read your story on any device.
        </p>
        <Link
          href={`/read/${storyId}`}
          className="mt-5 inline-flex items-center justify-center rounded-full bg-sage-700 px-5 py-2.5 text-sm font-semibold text-cream-50 shadow-sm transition-colors hover:bg-sage-900"
          style={{ background: "var(--color-bark-900)" }}
        >
          Read the story
        </Link>
      </div>
    </div>
  );
}
