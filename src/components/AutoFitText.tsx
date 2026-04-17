"use client";

import { useAutoFitFontSize } from "./useAutoFitFontSize";

interface AutoFitTextProps {
  text: string;
  logicalWidth: number;
  logicalMaxFontSize: number;
  color: string;
  fontFamily: string;
  fontWeight: string;
}

export default function AutoFitText({
  text,
  logicalWidth,
  logicalMaxFontSize,
  color,
  fontFamily,
  fontWeight,
}: AutoFitTextProps) {
  const { containerRef, fontSizePx } = useAutoFitFontSize({
    text,
    logicalWidth,
    logicalMaxFontSize,
    fontFamily,
    fontWeight,
  });

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          color,
          fontFamily,
          fontWeight,
          lineHeight: 1.15,
          textAlign: "center",
          wordBreak: "break-word",
          whiteSpace: "pre-wrap",
          width: "100%",
          fontSize: `${fontSizePx}px`,
        }}
      >
        {text}
      </div>
    </div>
  );
}
