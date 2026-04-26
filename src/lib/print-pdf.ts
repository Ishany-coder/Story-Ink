// Generate print-ready interior + cover PDFs from a Story and upload them
// to Supabase Storage so Lulu can fetch them by URL. Kept deliberately
// simple for v1 — one story page per PDF page, full-bleed image with the
// narration text overlaid at the bottom. Custom layouts / stickers / user
// layers are NOT rendered yet; we use page.imageUrl + page.text.

import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
  type RGB,
} from "pdf-lib";
import type { Pet, Story, StoryPage } from "@/lib/types";
import { uploadGeneratedAudio } from "@/lib/supabase";
import { fetchWithTimeout, isAllowedContentUrl } from "@/lib/http";

const PRINT_IMAGE_FETCH_TIMEOUT_MS = 15_000;

// 8.5 × 8.5 inch trim. 72 PDF points per inch. Lulu requires 0.125" bleed
// on all outer edges for interior pages, so the final PDF page size is
// 8.75 × 8.75 in once bleed is added to both sides (0.125 × 2 = 0.25).
const PT_PER_IN = 72;
const TRIM_IN = 8.5;
const BLEED_IN = 0.125;

// Text strip (caption zone) lives inside the trim box, not in the bleed.
// We pull in 0.4" from trim edges for a safe margin.
const SAFE_MARGIN_IN = 0.4;

// Rough spine width calc for Lulu standard 60# uncoated interior. Their
// formula: pages × 0.002252 in. Minimum casewrap spine on Lulu is 0.125".
function spineWidthIn(pageCount: number): number {
  return Math.max(0.125, pageCount * 0.002252);
}

// Fetch the image at `url`, detecting whether it's PNG or JPG by the
// response content-type and the magic bytes (more reliable than url ext).
// Returns null on failure so the PDF still produces a page (blank fallback)
// rather than the whole call crashing.
async function fetchImageBytes(
  url: string
): Promise<{ bytes: Uint8Array; kind: "png" | "jpg" } | null> {
  // Same SSRF guard as gemini.fetchImageAsInlineData — source URLs come
  // from the stories table and are user-influenceable, so lock them to
  // our Supabase Storage host.
  if (!isAllowedContentUrl(url)) {
    console.warn(
      "[print-pdf] refusing to fetch image from disallowed host:",
      url
    );
    return null;
  }
  try {
    const res = await fetchWithTimeout(
      url,
      {},
      PRINT_IMAGE_FETCH_TIMEOUT_MS
    );
    if (!res.ok) return null;
    const arr = new Uint8Array(await res.arrayBuffer());
    // PNG magic: 89 50 4E 47 ...; JPG magic: FF D8 FF
    const isPng =
      arr.length > 8 &&
      arr[0] === 0x89 &&
      arr[1] === 0x50 &&
      arr[2] === 0x4e &&
      arr[3] === 0x47;
    return { bytes: arr, kind: isPng ? "png" : "jpg" };
  } catch (err) {
    console.warn("[print-pdf] image fetch failed:", url, err);
    return null;
  }
}

async function embedImage(pdf: PDFDocument, url: string) {
  const img = await fetchImageBytes(url);
  if (!img) return null;
  try {
    return img.kind === "png"
      ? await pdf.embedPng(img.bytes)
      : await pdf.embedJpg(img.bytes);
  } catch (err) {
    console.warn("[print-pdf] image embed failed:", url, err);
    return null;
  }
}

// Wrap `text` into an array of lines that each fit within `maxWidth` at the
// given font size. Greedy word-wrap — good enough for short picture-book
// captions where we're not trying to hit justification.
function wrapLines(
  text: string,
  font: PDFFont,
  fontSize: number,
  maxWidth: number
): string[] {
  const words = text.trim().split(/\s+/);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let line = words[0];
  for (let i = 1; i < words.length; i++) {
    const probe = `${line} ${words[i]}`;
    if (font.widthOfTextAtSize(probe, fontSize) <= maxWidth) {
      line = probe;
    } else {
      lines.push(line);
      line = words[i];
    }
  }
  lines.push(line);
  return lines;
}

// Draw wrapped narration text centered within a rectangle.
function drawCaption(
  page: PDFPage,
  text: string,
  font: PDFFont,
  box: { x: number; y: number; width: number; height: number },
  color: RGB
) {
  if (!text.trim()) return;
  // Try progressively smaller sizes until the block fits vertically.
  const sizes = [22, 20, 18, 16, 14, 12, 10];
  for (const size of sizes) {
    const lineHeight = size * 1.2;
    const lines = wrapLines(text, font, size, box.width);
    const totalHeight = lines.length * lineHeight;
    if (totalHeight > box.height && size !== sizes[sizes.length - 1]) continue;

    const startY = box.y + (box.height + totalHeight) / 2 - lineHeight;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const width = font.widthOfTextAtSize(line, size);
      page.drawText(line, {
        x: box.x + (box.width - width) / 2,
        y: startY - i * lineHeight,
        size,
        font,
        color,
      });
    }
    return;
  }
}

// ---------------------------------------------------------------------------
// Interior PDF. One PDF page per story page. Lulu requires the interior to
// be *at least* 24 pages for hardcover — we pad with blank pages at the end
// when the story is shorter so the spine dimensions hold.
// ---------------------------------------------------------------------------

const MIN_INTERIOR_PAGES = 24;

export interface InteriorPdfOptions {
  // For memorial pet stories, render dedication pages as front + back
  // matter (per the "C: both" answer to question 6). NULL → no
  // dedication pages, regular interior only.
  pet?: Pet | null;
}

export async function buildInteriorPdf(
  story: Story,
  options: InteriorPdfOptions = {}
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);

  const pageSize = (TRIM_IN + BLEED_IN * 2) * PT_PER_IN;
  const trimOffset = BLEED_IN * PT_PER_IN; // where the trim box starts
  const trimSize = TRIM_IN * PT_PER_IN;
  const safe = SAFE_MARGIN_IN * PT_PER_IN;

  const captionBoxHeight = 1.6 * PT_PER_IN; // ~1.6" strip at the bottom
  const imageBoxHeight = trimSize - captionBoxHeight;

  const memorial = options.pet?.mode === "memorial";

  // Front matter: dedication page on memorial books only.
  if (memorial && options.pet) {
    drawDedicationPage(pdf, font, italic, options.pet, {
      pageSize,
      trimOffset,
      trimSize,
      safe,
      placement: "front",
    });
  }

  for (const storyPage of story.pages) {
    await drawInteriorPage(pdf, storyPage, font, {
      pageSize,
      trimOffset,
      trimSize,
      safe,
      captionBoxHeight,
      imageBoxHeight,
    });
  }

  // Back matter: a quieter "in loving memory" panel after the story.
  if (memorial && options.pet) {
    drawDedicationPage(pdf, font, italic, options.pet, {
      pageSize,
      trimOffset,
      trimSize,
      safe,
      placement: "back",
    });
  }

  // Pad up to the minimum with blank pages so the physical book has enough
  // signatures for hardcover binding.
  while (pdf.getPageCount() < MIN_INTERIOR_PAGES) {
    pdf.addPage([pageSize, pageSize]);
  }

  return pdf.save();
}

// Memorial dedication page. Image-free, soft palette, two text blocks:
// a small italic intro ("In loving memory of") and the pet's name +
// dates centered. The pet.dedication_text override (if set) replaces
// the templated body on both placements.
function drawDedicationPage(
  pdf: PDFDocument,
  font: PDFFont,
  italic: PDFFont,
  pet: Pet,
  dims: {
    pageSize: number;
    trimOffset: number;
    trimSize: number;
    safe: number;
    placement: "front" | "back";
  }
) {
  const { pageSize, trimOffset, trimSize, safe, placement } = dims;
  const page = pdf.addPage([pageSize, pageSize]);

  // Soft cream background, fills bleed.
  page.drawRectangle({
    x: 0,
    y: 0,
    width: pageSize,
    height: pageSize,
    color: rgb(0.985, 0.972, 0.95),
  });

  // Subtle laurel-style framing rule near the bottom.
  page.drawLine({
    start: { x: trimOffset + safe * 1.5, y: trimOffset + safe * 1.5 },
    end: {
      x: trimOffset + trimSize - safe * 1.5,
      y: trimOffset + safe * 1.5,
    },
    thickness: 0.5,
    color: rgb(0.55, 0.45, 0.7),
  });

  const intro = placement === "front" ? "In loving memory of" : "Forever in our hearts";
  drawCaption(
    page,
    intro,
    italic,
    {
      x: trimOffset + safe,
      y: trimOffset + trimSize * 0.7,
      width: trimSize - safe * 2,
      height: 0.6 * 72,
    },
    rgb(0.45, 0.36, 0.65)
  );

  drawCaption(
    page,
    pet.name,
    font,
    {
      x: trimOffset + safe,
      y: trimOffset + trimSize * 0.5,
      width: trimSize - safe * 2,
      height: 1.2 * 72,
    },
    rgb(0.18, 0.1, 0.35)
  );

  if (pet.passed_at) {
    drawCaption(
      page,
      pet.passed_at,
      italic,
      {
        x: trimOffset + safe,
        y: trimOffset + trimSize * 0.42,
        width: trimSize - safe * 2,
        height: 0.5 * 72,
      },
      rgb(0.45, 0.36, 0.65)
    );
  }

  // Body — user override or templated default.
  const body =
    pet.dedication_text ||
    (placement === "front"
      ? `A storybook for ${pet.name}, with love.`
      : `${pet.name} — thank you for the years.`);
  drawCaption(
    page,
    body,
    italic,
    {
      x: trimOffset + safe,
      y: trimOffset + safe * 2,
      width: trimSize - safe * 2,
      height: trimSize * 0.25,
    },
    rgb(0.3, 0.22, 0.5)
  );
}

async function drawInteriorPage(
  pdf: PDFDocument,
  storyPage: StoryPage,
  font: PDFFont,
  dims: {
    pageSize: number;
    trimOffset: number;
    trimSize: number;
    safe: number;
    captionBoxHeight: number;
    imageBoxHeight: number;
  }
) {
  const { pageSize, trimOffset, trimSize, safe, captionBoxHeight, imageBoxHeight } =
    dims;
  const page = pdf.addPage([pageSize, pageSize]);

  // Background (fills to bleed so there are no white edges after trim).
  page.drawRectangle({
    x: 0,
    y: 0,
    width: pageSize,
    height: pageSize,
    color: rgb(0.98, 0.96, 0.99),
  });

  // Image — full-bleed across the top portion of the page.
  const image = storyPage.imageUrl
    ? await embedImage(pdf, storyPage.imageUrl)
    : null;
  if (image) {
    const imgTop = pageSize; // include bleed on top + sides
    const imgBottom = trimOffset + captionBoxHeight; // stops above caption
    const imgHeight = imgTop - imgBottom;
    page.drawImage(image, {
      x: 0,
      y: imgBottom,
      width: pageSize,
      height: imgHeight,
    });
    // imageBoxHeight might diverge slightly from imgHeight due to bleed
    // inclusion; that's intentional, we fill the bleed.
    void imageBoxHeight;
  }

  // Caption block: centered text in a safe-margin box below the image.
  drawCaption(
    page,
    storyPage.text ?? "",
    font,
    {
      x: trimOffset + safe,
      y: trimOffset + safe,
      width: trimSize - safe * 2,
      height: captionBoxHeight - safe * 2,
    },
    rgb(0.12, 0.07, 0.28)
  );

  // Page number in the bottom-right safe corner.
  const pn = String(storyPage.pageNumber);
  const pnSize = 10;
  page.drawText(pn, {
    x: trimOffset + trimSize - safe - font.widthOfTextAtSize(pn, pnSize),
    y: trimOffset + safe * 0.4,
    size: pnSize,
    font,
    color: rgb(0.4, 0.3, 0.55),
  });
}

// ---------------------------------------------------------------------------
// Cover PDF. A single landscape spread: back cover | spine | front cover.
// For a casewrap hardcover Lulu wants: (trim × 2) + spine + 0.75" wrap per
// outer edge. We keep the title on the front cover and leave the spine
// blank (safer for short books where the spine is thin).
// ---------------------------------------------------------------------------

const COVER_WRAP_IN = 0.75;

export async function buildCoverPdf(story: Story): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);

  const pageCount = Math.max(story.pages.length, MIN_INTERIOR_PAGES);
  const spineIn = spineWidthIn(pageCount);
  const widthIn = TRIM_IN * 2 + spineIn + COVER_WRAP_IN * 2;
  const heightIn = TRIM_IN + COVER_WRAP_IN * 2;
  const width = widthIn * PT_PER_IN;
  const height = heightIn * PT_PER_IN;

  const page = pdf.addPage([width, height]);

  // Full-bleed background color so the physical casewrap is never white.
  page.drawRectangle({
    x: 0,
    y: 0,
    width,
    height,
    color: rgb(0.94, 0.91, 1.0),
  });

  // Front cover occupies the right half of the spread (after the wrap).
  const frontX =
    COVER_WRAP_IN * PT_PER_IN + TRIM_IN * PT_PER_IN + spineIn * PT_PER_IN;
  const frontY = COVER_WRAP_IN * PT_PER_IN;
  const trimPts = TRIM_IN * PT_PER_IN;

  // Front cover art: use the first page image as the cover illustration.
  const coverImageUrl = story.cover_image || story.pages[0]?.imageUrl;
  if (coverImageUrl) {
    const img = await embedImage(pdf, coverImageUrl);
    if (img) {
      page.drawImage(img, {
        x: frontX,
        y: frontY,
        width: trimPts,
        height: trimPts,
      });
      // Dark overlay at the top for title contrast.
      page.drawRectangle({
        x: frontX,
        y: frontY + trimPts * 0.75,
        width: trimPts,
        height: trimPts * 0.25,
        color: rgb(0.08, 0.04, 0.2),
        opacity: 0.55,
      });
    }
  }

  // Title text.
  drawCaption(
    page,
    story.title,
    font,
    {
      x: frontX + 0.4 * PT_PER_IN,
      y: frontY + trimPts * 0.78,
      width: trimPts - 0.8 * PT_PER_IN,
      height: trimPts * 0.18,
    },
    rgb(1, 1, 1)
  );

  return pdf.save();
}

// Convenience: build both + upload + return the two URLs. Uses the same
// uploadGeneratedAudio helper (it just writes bytes with a mime — audio vs
// pdf doesn't matter).
//
// `pet` is the pet row associated with the story (may be null for
// generic stories). When the pet is in memorial mode, dedication
// pages are added to the interior PDF as front + back matter.
export async function buildAndUploadPrintPdfs(
  story: Story,
  pet: Pet | null = null
): Promise<{ interiorUrl: string; coverUrl: string; pageCount: number }> {
  const [interiorBytes, coverBytes] = await Promise.all([
    buildInteriorPdf(story, { pet }),
    buildCoverPdf(story),
  ]);

  const [interiorUrl, coverUrl] = await Promise.all([
    uploadGeneratedAudio(Buffer.from(interiorBytes), {
      mime: "application/pdf",
      ext: "pdf",
      pathPrefix: `print/${story.id}/interior`,
    }),
    uploadGeneratedAudio(Buffer.from(coverBytes), {
      mime: "application/pdf",
      ext: "pdf",
      pathPrefix: `print/${story.id}/cover`,
    }),
  ]);

  // pageCount must match the interior PDF — Lulu uses it for spine
  // calc + costing. Memorial books include 2 extra dedication pages.
  const dedicationPages = pet?.mode === "memorial" ? 2 : 0;
  const pageCount = Math.max(
    story.pages.length + dedicationPages,
    MIN_INTERIOR_PAGES
  );

  return { interiorUrl, coverUrl, pageCount };
}
