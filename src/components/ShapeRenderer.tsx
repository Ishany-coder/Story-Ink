"use client";

import type { ShapeLayer } from "@/lib/types";
import { getIcon } from "@/lib/shapeIcons";

// Renders any ShapeLayer kind: rect, circle, line, icon (Lucide), path
// (uploaded SVG). Used by both the editor canvas and the read-only slide
// reader so a shape looks identical in both places.
export default function ShapeRenderer({ layer }: { layer: ShapeLayer }) {
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

  if (layer.shape === "line") {
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

  if (layer.shape === "icon" && layer.iconName) {
    const Icon = getIcon(layer.iconName);
    if (!Icon) return null;
    return (
      <Icon
        // Keep strokeWidth in a sensible range for Lucide's design grid
        // (1–4 reads as thin–thick; anything above 8 breaks the path).
        strokeWidth={Math.max(0.5, Math.min(8, layer.strokeWidth))}
        color={layer.stroke}
        fill={layer.fill === "transparent" ? "none" : layer.fill}
        style={{ width: "100%", height: "100%" }}
      />
    );
  }

  if (layer.shape === "path" && layer.svgMarkup) {
    return (
      <svg
        viewBox={layer.viewBox ?? "0 0 24 24"}
        preserveAspectRatio="xMidYMid meet"
        style={{
          width: "100%",
          height: "100%",
          // SVGs that use currentColor pick up the wrapper color; ones with
          // baked-in fills keep theirs.
          color: layer.stroke,
        }}
        // Sanitized at upload time — strips <script> and on* event handlers.
        dangerouslySetInnerHTML={{ __html: layer.svgMarkup }}
      />
    );
  }

  return null;
}
