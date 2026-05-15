import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import path from "node:path";

// File-based convention: Next.js serves the output of this route at
// /opengraph-image and wires it into <meta property="og:image"> +
// Twitter card metadata for the root layout automatically. Rendered
// once at request time; cache headers default to public+immutable.
//
// We render with the Node runtime so we can read the brand mark from
// the filesystem (`public/logo-mark.png`) instead of needing a fetch.

export const runtime = "nodejs";
export const alt = "StoryInk — The fine art of pet storytelling";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage() {
  const logoBytes = await readFile(
    path.join(process.cwd(), "public/logo-mark.png")
  );
  const logoSrc = `data:image/png;base64,${logoBytes.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#f6f2ea",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          padding: "72px",
          fontFamily: "serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "36px",
          }}
        >
          <img src={logoSrc} width={200} height={200} alt="" />
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "18px",
            }}
          >
            <div
              style={{
                fontSize: "20px",
                letterSpacing: "6px",
                textTransform: "uppercase",
                color: "#4a6b3a",
                fontWeight: 500,
              }}
            >
              The fine art of pet storytelling
            </div>
            <div
              style={{
                fontSize: "112px",
                fontWeight: 700,
                color: "#1a1814",
                lineHeight: 1,
                display: "flex",
              }}
            >
              <span>Story</span>
              <span style={{ color: "#4a6b3a" }}>Ink</span>
            </div>
          </div>
        </div>
        <div
          style={{
            marginTop: "56px",
            fontSize: "30px",
            color: "#5a5247",
            textAlign: "center",
            maxWidth: "920px",
            lineHeight: 1.4,
            display: "flex",
          }}
        >
          Hand-illustrated keepsake storybooks starring your pet — printed as
          museum-grade hardcovers.
        </div>
      </div>
    ),
    size
  );
}
