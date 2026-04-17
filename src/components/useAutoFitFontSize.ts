"use client";

import { useLayoutEffect, useRef, useState } from "react";

interface Args {
  text: string;
  // Layer width in canvas-logical pixels; used to convert the logical cap
  // into CSS px via the canvas display scale.
  logicalWidth: number;
  // Max font size in canvas-logical pixels. Rendered size never exceeds this.
  logicalMaxFontSize: number;
  fontFamily: string;
  fontWeight: string;
  lineHeight?: number;
}

// Shared autofit: binary-searches the largest font size (in CSS px) at which
// the given text fits inside the attached container. Re-runs on container
// resize. The returned ref should be attached to the bounding box; the
// returned fontSizePx can be applied to both rendered text and a textarea so
// the two stay visually identical across edit/view toggling.
export function useAutoFitFontSize({
  text,
  logicalWidth,
  logicalMaxFontSize,
  fontFamily,
  fontWeight,
  lineHeight = 1.15,
}: Args): {
  containerRef: React.RefObject<HTMLDivElement | null>;
  fontSizePx: number;
} {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [fontSizePx, setFontSizePx] = useState(12);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Hidden off-screen measurer — sized identically to the container so the
    // text wraps the same way it will on-screen, but invisible to the user.
    const measure = document.createElement("div");
    measure.style.position = "absolute";
    measure.style.visibility = "hidden";
    measure.style.whiteSpace = "pre-wrap";
    measure.style.wordBreak = "break-word";
    measure.style.fontFamily = fontFamily;
    measure.style.fontWeight = fontWeight;
    measure.style.lineHeight = String(lineHeight);
    measure.style.top = "0";
    measure.style.left = "0";
    measure.style.pointerEvents = "none";
    measure.textContent = text || " ";
    document.body.appendChild(measure);

    function fit() {
      if (!container) return;
      const cw = container.clientWidth;
      const ch = container.clientHeight;
      if (cw <= 0 || ch <= 0) return;

      measure.style.width = `${cw}px`;

      const scale = logicalWidth > 0 ? cw / logicalWidth : 1;
      const maxPx = Math.max(6, Math.floor(logicalMaxFontSize * scale));

      let lo = 6;
      let hi = maxPx;
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        measure.style.fontSize = `${mid}px`;
        if (
          measure.scrollHeight <= ch + 1 &&
          measure.scrollWidth <= cw + 1
        ) {
          lo = mid;
        } else {
          hi = mid - 1;
        }
      }
      setFontSizePx(lo);
    }

    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(container);
    return () => {
      ro.disconnect();
      if (measure.parentNode) measure.parentNode.removeChild(measure);
    };
  }, [text, logicalWidth, logicalMaxFontSize, fontFamily, fontWeight, lineHeight]);

  return { containerRef, fontSizePx };
}
