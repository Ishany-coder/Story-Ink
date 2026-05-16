// One-off generator for "Who is this book for?" recipient-tile samples.
//
// Generates 9 watercolor illustrations (one per primary recipient tile)
// using the same Gemini image model + sharp pipeline as the art-style
// generator. Output: public/recipient-samples/<id>.webp at 800x600.
//
// Usage:
//   node scripts/generate-recipient-samples.mjs

import { GoogleGenerativeAI } from "@google/generative-ai";
import sharp from "sharp";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, "..");
const outputDir = join(repoRoot, "public", "recipient-samples");

function loadEnv() {
  const raw = readFileSync(join(repoRoot, ".env.local"), "utf8");
  for (const line of raw.split("\n")) {
    const m = /^GEMINI_API_KEY\s*=\s*(.+)$/.exec(line);
    if (m) return m[1].trim().replace(/^["']|["']$/g, "");
  }
  throw new Error("GEMINI_API_KEY not found in .env.local");
}

const genAI = new GoogleGenerativeAI(loadEnv());

// All tiles share the same watercolor style + soft cream background so
// the grid reads as one cohesive set. Matches the reference UI.
const STYLE =
  "Soft watercolor portrait illustration on a warm cream background with gentle yellow and blue watercolor splotches around the subject. Hand-drawn line work, dreamy lighting, painterly texture, friendly storybook quality. Subjects are smiling and warmly lit. No text, no captions, no watermarks anywhere in the image.";

const RECIPIENTS = [
  {
    id: "child",
    scene:
      "Two laughing young redheaded siblings, a boy in a blue striped shirt and a girl in a floral sundress, hugging cheek to cheek. Freckled faces, happy expressions.",
  },
  {
    id: "baby",
    scene:
      "A young mother with long brown hair wearing a cream knit sweater, gently holding and kissing the forehead of her sleeping newborn baby swaddled in a soft yellow blanket.",
  },
  {
    id: "partner",
    scene:
      "A young couple — a man in a light blue shirt and a woman with curly brown hair in a floral top — leaning their foreheads together with warm laughing smiles.",
  },
  {
    id: "parent",
    scene:
      "A family trio of three smiling adults — an older Black mother with grey curly hair on the left, a young Latina daughter with curly hair in the middle, and an older white father with light hair on the right — close together cheek to cheek.",
  },
  {
    id: "niece_nephew",
    scene:
      "A friendly bearded young uncle in a backwards green baseball cap and dark hoodie crouching beside his blonde curly-haired toddler niece in a colorful sundress, both grinning ear to ear.",
  },
  {
    id: "sibling",
    scene:
      "Three smiling adult siblings — a bearded brother with dark curly hair in a denim jacket on the left, a clean-shaven brother in a green plaid shirt in the middle, and a sister with long brown hair on the right — arms around each other.",
  },
  {
    id: "friend",
    scene:
      "Two best-friend adult women laughing together — one with strawberry-blonde wavy hair in a floral green top, the other with long dark hair in a chambray button-down — heads close together.",
  },
  {
    id: "grandparent",
    scene:
      "A warm grandmother with grey wavy hair in a cream cardigan and a smiling grandfather in a tweed vest standing close together, each holding a young grandchild — a little boy on the left, a little girl on the right.",
  },
  {
    id: "pet",
    scene:
      "A trio of adorable pets together: a small black rabbit on the lower left, a golden retriever puppy in the center, and a fluffy seal-point ragdoll kitten on the right. Friendly faces, bright eyes, all looking at the viewer.",
  },
];

function promptFor(r) {
  return `${r.scene}\n\n${STYLE} Composition fits a landscape thumbnail (wider than tall) with the subject centered.`;
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

async function generateOne(recipient) {
  const model = genAI.getGenerativeModel({
    model: "gemini-3.1-flash-image-preview",
  });
  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: promptFor(recipient) }] }],
    generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
  });
  const { data } = extractFirstImage(result);
  const raw = Buffer.from(data, "base64");
  const processed = await sharp(raw)
    .resize(800, 600, { fit: "cover", position: "attention" })
    .webp({ quality: 82 })
    .toBuffer();
  writeFileSync(join(outputDir, `${recipient.id}.webp`), processed);
  console.log(
    `  ✓ ${recipient.id}.webp (${processed.byteLength.toLocaleString()} bytes)`
  );
}

async function main() {
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });
  console.log(`Generating ${RECIPIENTS.length} recipient-tile samples…\n`);
  let ok = 0;
  let fail = 0;
  for (const r of RECIPIENTS) {
    process.stdout.write(`${r.id}… `);
    try {
      await generateOne(r);
      ok++;
    } catch (err) {
      console.error(`\n  ✗ ${r.id} failed: ${err.message ?? err}`);
      fail++;
    }
    await new Promise((res) => setTimeout(res, 800));
  }
  console.log(`\nDone. ${ok} ok, ${fail} failed.`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
