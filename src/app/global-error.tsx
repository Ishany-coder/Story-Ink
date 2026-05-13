"use client";

import { useEffect } from "react";
import { reportError } from "@/lib/sentry";

// Fatal error boundary. Replaces the entire HTML chrome — runs when
// even the root layout couldn't render (broken provider, etc.). Must
// own <html>/<body> itself because the root layout is unavailable.
// Keep dependencies minimal here so this surface stays renderable
// when other code is broken.

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    reportError(error, "app.global-error");
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          backgroundColor: "#f5f1e8",
          color: "#1a2840",
          minHeight: "100vh",
          margin: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
        }}
      >
        <div style={{ maxWidth: "32rem", textAlign: "center" }}>
          <p
            style={{
              fontSize: "11px",
              textTransform: "uppercase",
              letterSpacing: "0.2em",
              color: "#1f3d2e",
              margin: 0,
            }}
          >
            Something went wrong
          </p>
          <h1
            style={{
              marginTop: "1rem",
              fontSize: "1.875rem",
              fontWeight: 600,
              color: "#0e1a2b",
            }}
          >
            StoryInk is having a moment
          </h1>
          <p style={{ marginTop: "0.75rem", color: "#3a4a5d", fontSize: "0.875rem" }}>
            Please refresh the page. If the problem keeps happening,
            email help@storyink.com.
          </p>
          {error.digest && (
            <p
              style={{
                marginTop: "0.5rem",
                fontFamily: "ui-monospace, monospace",
                fontSize: "10px",
                color: "#6b7686",
              }}
            >
              Reference: {error.digest}
            </p>
          )}
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              marginTop: "2rem",
              borderRadius: "9999px",
              backgroundColor: "#1f3d2e",
              color: "#faf7ee",
              padding: "0.5rem 1.25rem",
              fontSize: "0.875rem",
              fontWeight: 600,
              border: "none",
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
