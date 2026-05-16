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
  // Hidden layers don't render at all in the read-only view.
  if (layer.hidden) return null;

  const style: React.CSSProperties = {
    position: "absolute",
    left: `${(layer.x / CANVAS_SIZE) * 100}%`,
    top: `${(layer.y / CANVAS_SIZE) * 100}%`,
    width: `${(layer.width / CANVAS_SIZE) * 100}%`,
    height: `${(layer.height / CANVAS_SIZE) * 100}%`,
    transform: `rotate(${layer.rotation}deg)`,
    transformOrigin: "center center",
    pointerEvents: "none",
    opacity: layer.opacity ?? 1,
  };

  if (layer.type === "text") {
    const t = layer as TextLayer;
    // Build any optional text effects for the read view; mirrors the
    // editor's TextLayerContent so what-you-see-is-what-you-print.
    const shadowParts: string[] = [];
    if (t.shadow) {
      shadowParts.push(
        `${t.shadow.offsetX}px ${t.shadow.offsetY}px ${t.shadow.blur}px ${t.shadow.color}`
      );
    }
    if (t.stroke && t.stroke.width > 0) {
      const w = t.stroke.width;
      const c = t.stroke.color;
      for (let i = 0; i < 8; i++) {
        const a = (Math.PI / 4) * i;
        const dx = Math.cos(a) * w;
        const dy = Math.sin(a) * w;
        shadowParts.push(`${dx}px ${dy}px 0 ${c}`);
      }
    }
    return (
      <div style={style}>
        <AutoFitText
          text={t.text}
          logicalWidth={t.width}
          logicalMaxFontSize={t.fontSize}
          color={t.color}
          fontFamily={t.fontFamily}
          fontWeight={t.fontWeight}
          italic={t.italic}
          underline={t.underline}
          letterSpacing={t.letterSpacing}
          lineHeight={t.lineHeight}
          textAlign={t.textAlign}
          textShadow={shadowParts.length > 0 ? shadowParts.join(", ") : undefined}
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
  const fit = im.fit ?? (im.source === "layout" ? "cover" : "contain");
  // Layout-placed images are decorative scaffolding (template artwork);
  // user-placed images are content the reader actually wants screen
  // readers to announce. Keep layout images empty-alt so they're
  // skipped, but expose a meaningful default for user images.
  const altText = im.source === "layout" ? "" : "Illustration";

  // CSS filter() string from optional brightness/contrast/saturation/blur.
  const fparts: string[] = [];
  if (typeof im.brightness === "number") fparts.push(`brightness(${im.brightness})`);
  if (typeof im.contrast === "number") fparts.push(`contrast(${im.contrast})`);
  if (typeof im.saturation === "number") fparts.push(`saturate(${im.saturation})`);
  if (typeof im.blur === "number" && im.blur > 0) fparts.push(`blur(${im.blur}px)`);
  const filter = fparts.length > 0 ? fparts.join(" ") : undefined;

  // When a crop is set, use the background-image trick to render only the
  // crop region (mirrors editor logic).
  if (im.crop) {
    const c = im.crop;
    const bgSizeX = 100 / Math.max(0.001, c.width);
    const bgSizeY = 100 / Math.max(0.001, c.height);
    const bgPosX = (c.x / Math.max(0.001, 1 - c.width)) * 100;
    const bgPosY = (c.y / Math.max(0.001, 1 - c.height)) * 100;
    return (
      <div
        role={altText ? "img" : undefined}
        aria-label={altText || undefined}
        style={{
          ...style,
          overflow: "hidden",
          backgroundImage: `url(${JSON.stringify(im.src)})`,
          backgroundSize: `${bgSizeX}% ${bgSizeY}%`,
          backgroundPosition: `${Number.isFinite(bgPosX) ? bgPosX : 0}% ${
            Number.isFinite(bgPosY) ? bgPosY : 0
          }%`,
          backgroundRepeat: "no-repeat",
          filter,
        }}
      />
    );
  }

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
            filter,
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
          filter,
        }}
      />
    </div>
  );
}
