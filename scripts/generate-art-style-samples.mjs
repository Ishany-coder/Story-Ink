// One-off generator for art-style sample thumbnails.
//
// For each row in the curated art-style catalog, render a single sample
// image of a family-member scene using Gemini's image model, then crop
// + compress with sharp and write to public/art-style-samples/<id>.webp.
//
// Usage:
//   node scripts/generate-art-style-samples.mjs
//
// Reads GEMINI_API_KEY from .env.local (no dotenv dep; tiny parser inline).
// Idempotent: re-running overwrites existing samples.

import { GoogleGenerativeAI } from "@google/generative-ai";
import sharp from "sharp";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, "..");
const outputDir = join(repoRoot, "public", "art-style-samples");

// Minimal .env.local parser — only the GEMINI_API_KEY line.
function loadEnv() {
  const raw = readFileSync(join(repoRoot, ".env.local"), "utf8");
  for (const line of raw.split("\n")) {
    const m = /^GEMINI_API_KEY\s*=\s*(.+)$/.exec(line);
    if (m) return m[1].trim().replace(/^["']|["']$/g, "");
  }
  throw new Error("GEMINI_API_KEY not found in .env.local");
}

const apiKey = loadEnv();
const genAI = new GoogleGenerativeAI(apiKey);

// The 9 art-style rows from supabase/seed-art-styles.sql. Each one paired
// with a family scene that shows the style's range on a real-world subject
// (people, not pets) so the wizard preview is honest.
const STYLES = [
  {
    id: "whimsy_watercolor",
    scene:
      "A young mother in a denim jacket holding her toddler son in a flower garden full of pink hollyhocks. Warm afternoon light. Both faces visible and smiling.",
    style:
      "illustrated in soft watercolor with gentle washes of color, hand-drawn line work, dreamy lighting, painterly texture",
  },
  {
    id: "whiteboard_crayon",
    scene:
      "A father in a cowboy hat sitting on the grass with his young daughter beside him, a friendly brown dog nearby. Summer countryside background.",
    style:
      "crayon-style illustration on white paper, bold colored outlines, slightly textured strokes, playful energy",
  },
  {
    id: "sketch_magic",
    scene:
      "A father in an apron cooking with his two young kids at a kitchen counter, blender and eggs on the counter. Warm kitchen window light.",
    style:
      "pencil sketch illustration, soft graphite shading, light hand-applied color washes, storybook quality",
  },
  {
    id: "superhero_comic",
    scene:
      "An excited dad and his young son in superhero capes, the son cheering with arms in the air, the dad holding up a blueprint of a toy car. A workshop background with a HURRAH speech bubble.",
    style:
      "comic book illustration, bold ink outlines, flat saturated color, halftone shading, dynamic poses",
  },
  {
    id: "cartoon_adventure",
    scene:
      "A young boy in a white t-shirt sitting in a red wagon eating a donut, surrounded by autumn leaves and pumpkins, a red barn in the background.",
    style:
      "cheerful animated cartoon illustration, rounded forms, bright saturated palette, soft cel shading",
  },
  {
    id: "color_paper_cutouts",
    scene:
      "A baby in a yellow onesie sitting on a sandy beach with little green turtles around them and a shovel in hand. Sea waves in the background.",
    style:
      "cut-paper collage illustration, layered construction paper with visible texture, simple silhouettes, gentle shadows",
  },
  {
    id: "folk_tale_storybook",
    scene:
      "A small girl in a black-and-red dress and pigtails standing near a giant orange fox. Magical folk-tale forest. Holding a small white apple.",
    style:
      "folk-art storybook illustration, ornamental patterns, rich earthy palette, flat stylized figures",
  },
  {
    id: "studio_ghibli",
    scene:
      "A bride in a white gown and a groom in a navy suit walking through a glowing magical forest with floating wisps of light and a Japanese-style pagoda in the distance.",
    style:
      "hand-painted illustration in the style of classic Japanese animated films, atmospheric lighting, painterly backgrounds, gentle realism",
  },
  {
    id: "soft_romantic",
    scene:
      "A couple in cozy holiday sweaters cuddling on a pink couch, surrounded by soft pink hearts and floral decorations. Both wearing red caps.",
    style:
      "soft romantic illustration, blush and pastel palette, gentle linework, decorative hearts and florals",
  },
];

function promptFor(s) {
  return `${s.scene}\n\n${s.style}. Storybook illustration, no text, no captions, no watermarks anywhere in the image. Composition fits a landscape thumbnail (wider than tall).`;
}

function extractFirstImage(result) {
  const parts = result.response?.candidates?.[0]?.content?.parts ?? [];
  for (const p of parts) {
    const data = p.inlineData?.data;
    const mime = p.inlineData?.mimeType;
    if (data && mime) return { data, mime };
  }
  throw new Error("no image in response");
}

async function generateOne(style) {
  const model = genAI.getGenerativeModel({
    model: "gemini-3.1-flash-image-preview",
  });
  const prompt = promptFor(style);
  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      responseModalities: ["IMAGE", "TEXT"],
    },
  });
  const { data } = extractFirstImage(result);
  const raw = Buffer.from(data, "base64");
  // Resize to a sane 800x600 landscape thumbnail (4:3 to match the
  // wizard's aspect-[4/3] card). cover-fit so the focal subject stays
  // centered if Gemini returned a square. webp + q=82 for ~50-80KB files.
  const processed = await sharp(raw)
    .resize(800, 600, { fit: "cover", position: "attention" })
    .webp({ quality: 82 })
    .toBuffer();
  const outPath = join(outputDir, `${style.id}.webp`);
  writeFileSync(outPath, processed);
  console.log(
    `  ✓ ${style.id}.webp (${processed.byteLength.toLocaleString()} bytes)`
  );
}

async function main() {
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

  console.log(`Generating ${STYLES.length} art-style sample images…\n`);
  let ok = 0;
  let fail = 0;
  for (const s of STYLES) {
    process.stdout.write(`${s.id}… `);
    try {
      await generateOne(s);
      ok++;
    } catch (err) {
      console.error(`\n  ✗ ${s.id} failed: ${err.message ?? err}`);
      fail++;
    }
    // Small inter-request pause to avoid hitting per-minute caps.
    await new Promise((r) => setTimeout(r, 800));
  }
  console.log(`\nDone. ${ok} ok, ${fail} failed.`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
