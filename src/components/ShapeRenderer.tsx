"use client";

import type { ShapeLayer } from "@/lib/types";
import { getIcon } from "@/lib/shapeIcons";

// Renders any ShapeLayer kind: rect, circle, line, icon (Lucide), path
// (uploaded SVG). Used by both the editor canvas and the read-only slide
// reader so a shape looks identical in both places.
export default function ShapeRenderer({ layer }: { layer: ShapeLayer }) {
  // Optional dash pattern, supported on rect / circle / line via the SVG
  // path when set. Falls back to the legacy CSS border render when
  // strokeDash is undefined/empty.
  const dash = layer.strokeDash && layer.strokeDash.trim().length > 0;

  if (layer.shape === "rect") {
    const radius = typeof layer.cornerRadius === "number" ? layer.cornerRadius : 12;
    if (dash) {
      // Use SVG so we can dash the stroke. Inset the rect by half the
      // stroke width so the dashes stay inside the layer bounds.
      const sw = layer.strokeWidth;
      return (
        <svg
          width="100%"
          height="100%"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          <rect
            x={sw / 2}
            y={sw / 2}
            width={100 - sw}
            height={100 - sw}
            rx={radius}
            fill={layer.fill === "transparent" ? "none" : layer.fill}
            stroke={layer.stroke}
            strokeWidth={sw}
            strokeDasharray={layer.strokeDash}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      );
    }
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: layer.fill,
          border: `${layer.strokeWidth}px solid ${layer.stroke}`,
          borderRadius: radius,
        }}
      />
    );
  }

  if (layer.shape === "circle") {
    if (dash) {
      const sw = layer.strokeWidth;
      return (
        <svg
          width="100%"
          height="100%"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          <ellipse
            cx={50}
            cy={50}
            rx={50 - sw / 2}
            ry={50 - sw / 2}
            fill={layer.fill === "transparent" ? "none" : layer.fill}
            stroke={layer.stroke}
            strokeWidth={sw}
            strokeDasharray={layer.strokeDash}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      );
    }
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
    if (dash) {
      return (
        <svg
          width="100%"
          height="100%"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          <line
            x1={0}
            y1={50}
            x2={100}
            y2={50}
            stroke={layer.stroke}
            strokeWidth={layer.strokeWidth}
            strokeDasharray={layer.strokeDash}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      );
    }
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
