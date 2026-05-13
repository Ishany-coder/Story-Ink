"use client";

import Image from "next/image";
import {
  CANVAS_SIZE,
  type ImageLayer,
  type Layer,
  type TextLayer,
} from "@/lib/types";
import AutoFitText from "./AutoFitText";
import ShapeRenderer from "./ShapeRenderer";

// Renders a single overlay layer read-only — no drag handles, no edit
// affordances. Used by both SlideReader (the reader view) and the AI
// Assistant preview (big page comparison).
export default function ReadOnlyLayer({ layer }: { layer: Layer }) {
  const style: React.CSSProperties = {
    position: "absolute",
    left: `${(layer.x / CANVAS_SIZE) * 100}%`,
    top: `${(layer.y / CANVAS_SIZE) * 100}%`,
    width: `${(layer.width / CANVAS_SIZE) * 100}%`,
    height: `${(layer.height / CANVAS_SIZE) * 100}%`,
    transform: `rotate(${layer.rotation}deg)`,
    transformOrigin: "center center",
    pointerEvents: "none",
  };

  if (layer.type === "text") {
    const t = layer as TextLayer;
    return (
      <div style={style}>
        <AutoFitText
          text={t.text}
          logicalWidth={t.width}
          logicalMaxFontSize={t.fontSize}
          color={t.color}
          fontFamily={t.fontFamily}
          fontWeight={t.fontWeight}
        />
      </div>
    );
  }

  if (layer.type === "shape") {
    return (
      <div style={style}>
        <ShapeRenderer layer={layer} />
      </div>
    );
  }

  const im = layer as ImageLayer;
  const fit = im.source === "layout" ? "cover" : "contain";
  // Layout-placed images are decorative scaffolding (template artwork);
  // user-placed images are content the reader actually wants screen
  // readers to announce. Keep layout images empty-alt so they're
  // skipped, but expose a meaningful default for user images.
  const altText = im.source === "layout" ? "" : "Illustration";
  // Data URLs (mid-upload drafts) bypass next/image — its loader
  // requires a real URL. Once persisted to Supabase Storage we get
  // the optimized pipeline + responsive sizes automatically.
  const isDataUrl = im.src.startsWith("data:");
  if (isDataUrl) {
    return (
      <div style={style}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={im.src}
          alt={altText}
          draggable={false}
          style={{
            width: "100%",
            height: "100%",
            objectFit: fit,
            userSelect: "none",
          }}
        />
      </div>
    );
  }
  return (
    <div style={{ ...style, overflow: "hidden" }}>
      <Image
        src={im.src}
        alt={altText}
        fill
        sizes="(max-width: 768px) 100vw, 768px"
        draggable={false}
        style={{
          objectFit: fit,
          userSelect: "none",
        }}
      />
    </div>
  );
}
