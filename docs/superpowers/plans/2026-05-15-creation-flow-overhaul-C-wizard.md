# Plan C — Wizard UI + Drafts

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the 7-step creation wizard at `/create/new`, the drafts API + auto-save, and the home page "Resume" list. After this plan a user can sign up, click "Create a book," walk all 7 steps with auto-save across refreshes, and trigger the V2 pipeline from Plan B.

**Architecture:** One `WizardClient.tsx` component owns step state and persistence. Each step is rendered inline (small switch statement) to keep the file walkable while reusing form state. Drafts API is thin CRUD over `story_drafts`. Home page reads drafts via the server, renders a Resume list above the library.

**Tech Stack:** Same as A and B. Manual verification — sign up fresh user, walk wizard, refresh mid-flow, hit Generate.

**Spec:** `docs/superpowers/specs/2026-05-15-creation-flow-overhaul-design.md`
**Depends on:** Plans A + B are landed.

---

## File map

**Created**
- `src/app/api/drafts/route.ts` — `GET` list + `POST` create
- `src/app/api/drafts/[id]/route.ts` — `GET` + `PATCH` + `DELETE`
- `src/lib/drafts.ts` — server-side draft helpers
- `src/app/create/new/page.tsx` — wizard host server component
- `src/components/wizard/WizardClient.tsx` — the step orchestrator
- `src/components/wizard/StepShell.tsx` — header + nav buttons + progress bar shared by all steps
- `src/components/wizard/CharacterPickerInline.tsx` — inline cast picker for Step 3
- `src/components/ResumeDraftCard.tsx` — home Resume card

**Modified**
- `src/app/page.tsx` — render Resume list; rewrite empty state to link to `/create/new`
- `src/components/HeroSection.tsx` — primary CTA → `/create/new` (do not delete inline form yet — Plan D deletes it)

---

## Task 1 — `src/lib/drafts.ts`

**Files:**
- Create: `src/lib/drafts.ts`

- [ ] **Step 1: Write the helpers.**

```ts
import { supabaseAdmin } from "@/lib/supabase";
import type { StoryDraft, WizardPayload } from "@/lib/types";

const MAX_DRAFTS_PER_USER = 50;

function autoTitle(payload: WizardPayload): string {
  const recipient = payload.recipientType ?? "someone";
  const occasion = payload.occasion ? ` ${payload.occasion}` : "";
  return `${recipient}${occasion} book — draft`.replace("_", " ");
}

export async function listDraftsForUser(userId: string): Promise<StoryDraft[]> {
  const { data, error } = await supabaseAdmin()
    .from("story_drafts")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(MAX_DRAFTS_PER_USER);
  if (error) throw new Error(`listDraftsForUser: ${error.message}`);
  return (data ?? []) as StoryDraft[];
}

export async function getDraftForUser(
  draftId: string,
  userId: string
): Promise<StoryDraft | null> {
  const { data, error } = await supabaseAdmin()
    .from("story_drafts")
    .select("*")
    .eq("id", draftId)
    .eq("user_id", userId)
    .maybeSingle<StoryDraft>();
  if (error) throw new Error(`getDraftForUser: ${error.message}`);
  return data;
}

export async function createDraftForUser(
  userId: string,
  initial?: Partial<WizardPayload>
): Promise<StoryDraft> {
  const payload = (initial ?? {}) as WizardPayload;
  const { data, error } = await supabaseAdmin()
    .from("story_drafts")
    .insert({
      user_id: userId,
      title: autoTitle(payload),
      current_step: 1,
      payload,
    })
    .select("*")
    .single<StoryDraft>();
  if (error || !data) throw new Error(`createDraftForUser: ${error?.message}`);
  return data;
}

export async function updateDraftForUser(
  draftId: string,
  userId: string,
  patch: { current_step?: number; payload?: WizardPayload }
): Promise<StoryDraft> {
  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (typeof patch.current_step === "number") {
    update.current_step = Math.min(Math.max(patch.current_step, 1), 7);
  }
  if (patch.payload) {
    update.payload = patch.payload;
    update.title = autoTitle(patch.payload);
  }
  const { data, error } = await supabaseAdmin()
    .from("story_drafts")
    .update(update)
    .eq("id", draftId)
    .eq("user_id", userId)
    .select("*")
    .single<StoryDraft>();
  if (error || !data) throw new Error(`updateDraftForUser: ${error?.message}`);
  return data;
}

export async function deleteDraftForUser(
  draftId: string,
  userId: string
): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("story_drafts")
    .delete()
    .eq("id", draftId)
    .eq("user_id", userId);
  if (error) throw new Error(`deleteDraftForUser: ${error.message}`);
}
```

- [ ] **Step 2: Build + commit.**

```bash
npm run build
git add src/lib/drafts.ts
git commit -m "drafts: add server-side CRUD helpers"
```

---

## Task 2 — Drafts API routes

**Files:**
- Create: `src/app/api/drafts/route.ts`
- Create: `src/app/api/drafts/[id]/route.ts`

- [ ] **Step 1: Collection route.**

```ts
// src/app/api/drafts/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/supabase-server";
import { createDraftForUser, listDraftsForUser } from "@/lib/drafts";
import type { WizardPayload } from "@/lib/types";

export async function GET() {
  try {
    const user = await requireUser();
    return NextResponse.json({ drafts: await listDraftsForUser(user.id) });
  } catch (err) {
    if (err instanceof UnauthorizedError)
      return NextResponse.json({ error: err.message }, { status: 401 });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = (await req.json().catch(() => ({}))) as {
      payload?: Partial<WizardPayload>;
    };
    const draft = await createDraftForUser(user.id, body.payload);
    return NextResponse.json({ draft }, { status: 201 });
  } catch (err) {
    if (err instanceof UnauthorizedError)
      return NextResponse.json({ error: err.message }, { status: 401 });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
```

- [ ] **Step 2: Per-id route.**

```ts
// src/app/api/drafts/[id]/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/supabase-server";
import {
  deleteDraftForUser,
  getDraftForUser,
  updateDraftForUser,
} from "@/lib/drafts";
import type { WizardPayload } from "@/lib/types";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const draft = await getDraftForUser(id, user.id);
    if (!draft) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ draft });
  } catch (err) {
    if (err instanceof UnauthorizedError)
      return NextResponse.json({ error: err.message }, { status: 401 });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const body = (await req.json()) as {
      current_step?: number;
      payload?: WizardPayload;
    };
    const draft = await updateDraftForUser(id, user.id, body);
    return NextResponse.json({ draft });
  } catch (err) {
    if (err instanceof UnauthorizedError)
      return NextResponse.json({ error: err.message }, { status: 401 });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    await deleteDraftForUser(id, user.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof UnauthorizedError)
      return NextResponse.json({ error: err.message }, { status: 401 });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
```

- [ ] **Step 3: Build + commit.**

```bash
npm run build
git add src/app/api/drafts
git commit -m "api: drafts CRUD routes"
```

---

## Task 3 — Wizard host page `/create/new`

**Files:**
- Create: `src/app/create/new/page.tsx`

- [ ] **Step 1: Write the host page.**

```tsx
// src/app/create/new/page.tsx
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase-server";
import { listCharactersForUser } from "@/lib/characters";
import { getDraftForUser, createDraftForUser } from "@/lib/drafts";
import { supabaseAdmin } from "@/lib/supabase";
import WizardClient from "@/components/wizard/WizardClient";
import type { ArtStyle, Character, StoryDraft } from "@/lib/types";

type Props = { searchParams: Promise<{ draft?: string }> };

export default async function CreateNewPage({ searchParams }: Props) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/create/new");
  const { draft: draftId } = await searchParams;

  let draft: StoryDraft | null = null;
  if (draftId) {
    draft = await getDraftForUser(draftId, user.id);
  }
  if (!draft) {
    draft = await createDraftForUser(user.id, {});
    redirect(`/create/new?draft=${draft.id}`);
  }

  const [characters, styles] = await Promise.all([
    listCharactersForUser(user.id),
    supabaseAdmin()
      .from("art_styles")
      .select("*")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .then(({ data }) => (data ?? []) as ArtStyle[]),
  ]);

  return (
    <main className="max-w-3xl mx-auto px-4 py-8">
      <WizardClient
        draft={draft}
        initialCharacters={characters as Character[]}
        artStyles={styles}
      />
    </main>
  );
}
```

- [ ] **Step 2: Commit (page won't build yet because WizardClient doesn't exist; that's fine — next task).**

```bash
git add src/app/create/new/page.tsx
# do NOT run build here — it will fail until Task 4 lands
```

---

## Task 4 — `WizardClient.tsx` (the step orchestrator)

**Files:**
- Create: `src/components/wizard/StepShell.tsx`
- Create: `src/components/wizard/WizardClient.tsx`

- [ ] **Step 1: Write the shared step shell.**

```tsx
// src/components/wizard/StepShell.tsx
"use client";

import type { ReactNode } from "react";

export default function StepShell({
  step,
  totalSteps,
  title,
  subtitle,
  children,
  onBack,
  onNext,
  nextLabel = "Next",
  nextDisabled,
}: {
  step: number;
  totalSteps: number;
  title: string;
  subtitle?: string;
  children: ReactNode;
  onBack?: () => void;
  onNext?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
}) {
  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs uppercase tracking-wide text-stone-500">
            Step {step} of {totalSteps}
          </span>
          <div className="flex-1 h-1 bg-stone-200 rounded">
            <div
              className="h-1 bg-black rounded"
              style={{ width: `${(step / totalSteps) * 100}%` }}
            />
          </div>
        </div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        {subtitle && <p className="text-stone-600 mt-1">{subtitle}</p>}
      </div>

      <div className="mb-8">{children}</div>

      <div className="flex items-center justify-between">
        {onBack ? (
          <button type="button" onClick={onBack} className="px-4 py-2 underline">
            ← Back
          </button>
        ) : (
          <span />
        )}
        {onNext && (
          <button
            type="button"
            onClick={onNext}
            disabled={nextDisabled}
            className="px-6 py-2 bg-black text-white rounded disabled:opacity-50"
          >
            {nextLabel}
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write the orchestrator.**

```tsx
// src/components/wizard/WizardClient.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import StepShell from "./StepShell";
import type {
  ArtStyle,
  Character,
  Occasion,
  RecipientType,
  StoryDraft,
  StoryTone,
  WizardPayload,
} from "@/lib/types";

const RECIPIENTS: { id: RecipientType; label: string }[] = [
  { id: "partner", label: "Partner" },
  { id: "child", label: "Child" },
  { id: "parent", label: "Parent" },
  { id: "sibling", label: "Sibling" },
  { id: "friend", label: "Friend" },
  { id: "self", label: "Self" },
  { id: "pet", label: "Pet" },
  { id: "other", label: "Other" },
];

const OCCASIONS: { id: Occasion; label: string }[] = [
  { id: "birthday", label: "Birthday" },
  { id: "anniversary", label: "Anniversary" },
  { id: "memorial", label: "Memorial" },
  { id: "just_because", label: "Just because" },
  { id: "graduation", label: "Graduation" },
  { id: "holiday", label: "Holiday" },
  { id: "new_baby", label: "New baby" },
  { id: "other", label: "Other" },
];

const PAGE_PRESETS = [8, 16, 24, 32, 48];

export default function WizardClient({
  draft,
  initialCharacters,
  artStyles,
}: {
  draft: StoryDraft;
  initialCharacters: Character[];
  artStyles: ArtStyle[];
}) {
  const router = useRouter();
  const [characters, setCharacters] = useState<Character[]>(initialCharacters);
  const [step, setStep] = useState<number>(draft.current_step);
  const [payload, setPayload] = useState<WizardPayload>(draft.payload ?? {});
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-save on every step / payload change (debounced).
  const saveRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (saveRef.current) clearTimeout(saveRef.current);
    saveRef.current = setTimeout(() => {
      fetch(`/api/drafts/${draft.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current_step: step, payload }),
      }).catch(() => {
        /* fire and forget */
      });
    }, 500);
    return () => {
      if (saveRef.current) clearTimeout(saveRef.current);
    };
  }, [step, payload, draft.id]);

  const totalSteps = 7;
  const set = (patch: Partial<WizardPayload>) =>
    setPayload((p) => ({ ...p, ...patch }));

  // Refresh character list (used when user returns from /characters/new).
  useEffect(() => {
    if (step !== 3) return;
    fetch("/api/characters")
      .then((r) => r.json())
      .then((b: { characters: Character[] }) =>
        setCharacters(b.characters ?? [])
      )
      .catch(() => undefined);
  }, [step]);

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/generate/v2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientType: payload.recipientType,
          occasion: payload.occasion,
          storyTone: payload.storyTone ?? "classic",
          castCharacterIds: payload.castCharacterIds ?? [],
          outline: payload.outline ?? "",
          keyMemories: payload.keyMemories ?? [],
          artStyleId: payload.artStyleId,
          pageCount: payload.pageCount ?? 16,
          title: payload.title,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const body = (await res.json()) as { storyId: string };
      // Delete the draft now that it's been promoted to a story.
      fetch(`/api/drafts/${draft.id}`, { method: "DELETE" }).catch(
        () => undefined
      );
      router.push(`/stories/${body.storyId}/progress`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "generate failed");
      setGenerating(false);
    }
  }

  // ---- Per-step rendering ------------------------------------------------

  if (step === 1) {
    return (
      <StepShell
        step={1}
        totalSteps={totalSteps}
        title="Who is this book for?"
        subtitle="Pick the relationship that fits best."
        onNext={() => setStep(2)}
        nextDisabled={!payload.recipientType}
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {RECIPIENTS.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => set({ recipientType: r.id })}
              className={`p-4 rounded border text-center ${
                payload.recipientType === r.id ? "bg-black text-white" : "bg-white"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </StepShell>
    );
  }

  if (step === 2) {
    return (
      <StepShell
        step={2}
        totalSteps={totalSteps}
        title="What's the occasion?"
        onBack={() => setStep(1)}
        onNext={() => setStep(3)}
        nextDisabled={!payload.occasion}
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {OCCASIONS.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => set({ occasion: o.id })}
              className={`p-4 rounded border text-center ${
                payload.occasion === o.id ? "bg-black text-white" : "bg-white"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </StepShell>
    );
  }

  if (step === 3) {
    const selectedIds = new Set(payload.castCharacterIds ?? []);
    return (
      <StepShell
        step={3}
        totalSteps={totalSteps}
        title="Build the cast"
        subtitle="Add at least one character. Their photos let the AI keep them looking like them on every page."
        onBack={() => setStep(2)}
        onNext={() => setStep(4)}
        nextDisabled={(payload.castCharacterIds ?? []).length === 0}
      >
        <div className="space-y-4">
          {characters.length === 0 && (
            <div className="border rounded-lg p-6 text-center bg-stone-50">
              <p className="text-stone-700 mb-3">
                You haven't added any characters yet.
              </p>
              <Link
                href={`/characters/new?next=/create/new?draft=${draft.id}`}
                className="px-4 py-2 bg-black text-white rounded inline-block"
              >
                Add your first character
              </Link>
            </div>
          )}
          {characters.length > 0 && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {characters.map((c) => {
                  const selected = selectedIds.has(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        const next = new Set(selectedIds);
                        if (selected) next.delete(c.id);
                        else next.add(c.id);
                        set({ castCharacterIds: Array.from(next) });
                      }}
                      className={`text-left rounded border overflow-hidden ${
                        selected ? "ring-2 ring-black" : ""
                      }`}
                    >
                      <div className="aspect-square bg-stone-100">
                        {c.reference_photo_urls[0] && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={c.reference_photo_urls[0]}
                            alt={c.name}
                            className="w-full h-full object-cover"
                          />
                        )}
                      </div>
                      <div className="p-2 text-sm">
                        <div className="font-medium">{c.name}</div>
                        <div className="text-stone-500 uppercase text-xs">
                          {c.kind}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
              <Link
                href={`/characters/new?next=/create/new?draft=${draft.id}`}
                className="inline-block underline"
              >
                + Add another character
              </Link>
            </>
          )}
        </div>
      </StepShell>
    );
  }

  if (step === 4) {
    const memories = payload.keyMemories ?? [];
    const [memoryDraft, setMemoryDraft] = [
      "" /* placeholder; controlled below */,
      undefined,
    ];
    return (
      <StepShell
        step={4}
        totalSteps={totalSteps}
        title="Your story outline"
        subtitle="What's the story about? Add any specific moments or details that should appear."
        onBack={() => setStep(3)}
        onNext={() => setStep(5)}
        nextDisabled={!payload.outline?.trim()}
      >
        <div className="space-y-4">
          <textarea
            value={payload.outline ?? ""}
            onChange={(e) => set({ outline: e.target.value })}
            rows={6}
            className="w-full border rounded p-3"
            placeholder="A magical adventure where Mom takes Maya on a road trip to find the world's biggest pancake…"
          />
          <KeyMemoriesEditor
            value={memories}
            onChange={(m) => set({ keyMemories: m })}
          />
        </div>
      </StepShell>
    );
  }

  if (step === 5) {
    return (
      <StepShell
        step={5}
        totalSteps={totalSteps}
        title="Pick your art style"
        subtitle="Choose how you'd like your story illustrated."
        onBack={() => setStep(4)}
        onNext={() => setStep(6)}
        nextDisabled={!payload.artStyleId}
      >
        <div className="mb-4">
          <div className="text-sm font-medium mb-2">Story style</div>
          <div className="inline-flex border rounded overflow-hidden">
            {(["classic", "rhyming"] as StoryTone[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => set({ storyTone: t })}
                className={`px-4 py-2 text-sm ${
                  (payload.storyTone ?? "classic") === t
                    ? "bg-black text-white"
                    : "bg-white"
                }`}
              >
                {t === "classic" ? "Classic" : "Rhyming"}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {artStyles.map((s) => {
            const selected = payload.artStyleId === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => set({ artStyleId: s.id })}
                className={`text-left rounded border overflow-hidden ${
                  selected ? "ring-2 ring-black" : ""
                }`}
              >
                <div className="aspect-[4/3] bg-stone-100">
                  {s.sample_image_urls[0] && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={s.sample_image_urls[0]}
                      alt={s.display_name}
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>
                <div className="p-2 text-sm font-medium">{s.display_name}</div>
              </button>
            );
          })}
        </div>
      </StepShell>
    );
  }

  if (step === 6) {
    const pageCount = payload.pageCount ?? 16;
    return (
      <StepShell
        step={6}
        totalSteps={totalSteps}
        title="How long should it be?"
        subtitle="≥ 24 pages can be ordered as a hardcover. Shorter is digital-only."
        onBack={() => setStep(5)}
        onNext={() => setStep(7)}
      >
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {PAGE_PRESETS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => set({ pageCount: n })}
                className={`px-4 py-2 rounded border ${
                  pageCount === n ? "bg-black text-white" : "bg-white"
                }`}
              >
                {n} pages
              </button>
            ))}
          </div>
          <div>
            <label className="block text-sm text-stone-600 mb-1">
              Custom (8–64)
            </label>
            <input
              type="number"
              min={8}
              max={64}
              value={pageCount}
              onChange={(e) =>
                set({
                  pageCount: Math.min(
                    Math.max(parseInt(e.target.value, 10) || 16, 8),
                    64
                  ),
                })
              }
              className="border rounded px-3 py-2 w-32"
            />
          </div>
          <p className="text-sm text-stone-500">
            {pageCount >= 24
              ? "✓ Eligible for hardcover printing."
              : "Digital only — too short for hardcover."}
          </p>
        </div>
      </StepShell>
    );
  }

  // Step 7
  const selectedCast = characters.filter((c) =>
    (payload.castCharacterIds ?? []).includes(c.id)
  );
  const selectedStyle = artStyles.find((s) => s.id === payload.artStyleId);
  return (
    <StepShell
      step={7}
      totalSteps={totalSteps}
      title="Ready to generate?"
      subtitle="Review your inputs. You'll get to approve the cast portraits before pages render."
      onBack={() => setStep(6)}
      onNext={generate}
      nextLabel={generating ? "Sending…" : "Generate book"}
      nextDisabled={generating}
    >
      <dl className="space-y-3 text-sm">
        <div>
          <dt className="text-stone-500">Recipient</dt>
          <dd className="font-medium">{payload.recipientType}</dd>
        </div>
        <div>
          <dt className="text-stone-500">Occasion</dt>
          <dd className="font-medium">{payload.occasion}</dd>
        </div>
        <div>
          <dt className="text-stone-500">Cast</dt>
          <dd className="font-medium">
            {selectedCast.map((c) => c.name).join(", ") || "(none)"}
          </dd>
        </div>
        <div>
          <dt className="text-stone-500">Outline</dt>
          <dd className="font-medium whitespace-pre-wrap">{payload.outline}</dd>
        </div>
        <div>
          <dt className="text-stone-500">Style</dt>
          <dd className="font-medium">{selectedStyle?.display_name}</dd>
        </div>
        <div>
          <dt className="text-stone-500">Pages</dt>
          <dd className="font-medium">{payload.pageCount ?? 16}</dd>
        </div>
      </dl>
      {error && <div className="text-red-600 text-sm mt-4">{error}</div>}
    </StepShell>
  );
}

function KeyMemoriesEditor({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  function add() {
    const t = draft.trim();
    if (!t) return;
    onChange([...value, t]);
    setDraft("");
  }
  return (
    <div>
      <label className="block text-sm font-medium mb-1">
        Key memories (optional)
      </label>
      <div className="flex gap-2 mb-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder='e.g. "trip to Maine 2019"'
          className="flex-1 border rounded px-3 py-2"
        />
        <button
          type="button"
          onClick={add}
          className="px-4 py-2 border rounded"
        >
          Add
        </button>
      </div>
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {value.map((m, i) => (
            <li
              key={`${i}-${m}`}
              className="inline-flex items-center gap-1 bg-stone-100 rounded px-2 py-1 text-sm"
            >
              {m}
              <button
                type="button"
                onClick={() => onChange(value.filter((_, j) => j !== i))}
                className="text-stone-500"
                aria-label="remove"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

> **Note:** the `Step 4` block uses a deliberately throwaway `[memoryDraft, setMemoryDraft]` destructure to satisfy the inline reading; the real input is the embedded `<KeyMemoriesEditor>`. Remove the throwaway lines if your linter flags unused; they exist only as a hint that we don't need a parent-scope draft state.

- [ ] **Step 3: Build + commit.**

Run: `npm run build` — expected clean. If lint complains about unused `memoryDraft`, delete that line.

```bash
git add src/components/wizard
git commit -m "wizard: WizardClient + StepShell"
```

---

## Task 5 — `/characters/new` "next" param wiring

**Files:**
- Modify: `src/app/characters/new/page.tsx`
- Modify: `src/components/CharacterForm.tsx`

- [ ] **Step 1: Read `next` param in `/characters/new`.**

Update `src/app/characters/new/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase-server";
import CharacterForm from "@/components/CharacterForm";

type Props = { searchParams: Promise<{ next?: string }> };

export default async function NewCharacterPage({ searchParams }: Props) {
  const user = await getCurrentUser();
  const { next } = await searchParams;
  if (!user) redirect(`/login?next=${encodeURIComponent("/characters/new")}`);
  return (
    <main className="max-w-xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-semibold mb-6">Add a character</h1>
      <CharacterForm initial={null} nextHref={next} />
    </main>
  );
}
```

- [ ] **Step 2: Honor `nextHref` in CharacterForm after save.**

In `src/components/CharacterForm.tsx`, change the props type and the redirect target:

```ts
type Props = {
  initial: Character | null;
  nextHref?: string;
};
```

In `handleSubmit`, after success:

```ts
router.push(nextHref ?? "/characters");
router.refresh();
```

- [ ] **Step 3: Build + commit.**

```bash
npm run build
git add src/app/characters/new/page.tsx src/components/CharacterForm.tsx
git commit -m "characters: honor ?next on /characters/new"
```

---

## Task 6 — Home Resume list + new CTA

**Files:**
- Modify: `src/app/page.tsx`
- Create: `src/components/ResumeDraftCard.tsx`
- Modify: `src/components/HeroSection.tsx`

- [ ] **Step 1: Resume card.**

```tsx
// src/components/ResumeDraftCard.tsx
import Link from "next/link";
import type { StoryDraft } from "@/lib/types";

const STEP_LABELS = [
  "Step 1 · Recipient",
  "Step 2 · Occasion",
  "Step 3 · Cast",
  "Step 4 · Outline",
  "Step 5 · Style",
  "Step 6 · Length",
  "Step 7 · Review",
];

export default function ResumeDraftCard({ draft }: { draft: StoryDraft }) {
  const stepLabel = STEP_LABELS[Math.max(0, draft.current_step - 1)] ?? "";
  return (
    <Link
      href={`/create/new?draft=${draft.id}`}
      className="block border rounded-lg p-4 bg-white hover:shadow-sm"
    >
      <div className="font-medium">{draft.title ?? "Draft"}</div>
      <div className="text-sm text-stone-500">{stepLabel}</div>
      <div className="text-xs text-stone-400 mt-1">
        Updated {new Date(draft.updated_at).toLocaleDateString()}
      </div>
    </Link>
  );
}
```

- [ ] **Step 2: Update `src/app/page.tsx`.**

Read the current file first: `cat src/app/page.tsx`. Identify the section that renders the dashboard / library / hero conditional. Modify it to:

1. Read the user's drafts via `listDraftsForUser(user.id)` at the top alongside stories.
2. If `drafts.length > 0`, render a "Resume" section above the library:

```tsx
import { listDraftsForUser } from "@/lib/drafts";
import ResumeDraftCard from "@/components/ResumeDraftCard";

// inside the page component, after fetching user + stories:
const drafts = user ? await listDraftsForUser(user.id) : [];

// render block:
{drafts.length > 0 && (
  <section className="mt-8">
    <h2 className="text-lg font-semibold mb-3">Resume a draft</h2>
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {drafts.map((d) => (
        <ResumeDraftCard key={d.id} draft={d} />
      ))}
    </div>
  </section>
)}
```

3. Keep the existing empty-state CTA but change its primary button to point at `/create/new` instead of the old inline form anchor:

Find any `Link href="/create"` and change to `Link href="/create/new"`. Find the inline-form trigger (HomeCreate) and leave it alone for this plan — Plan D removes it. The new `/create/new` CTA is what we want users hitting today.

- [ ] **Step 3: Update `HeroSection.tsx`.**

Open `src/components/HeroSection.tsx`. Find the primary CTA button/link. Change its `href` to `/create/new` (label: "Start a book" or whatever copy is there). Do not delete the inline form coupling logic — that's Plan D.

- [ ] **Step 4: Build + commit.**

```bash
npm run build
git add src/app/page.tsx src/components/HeroSection.tsx src/components/ResumeDraftCard.tsx
git commit -m "home: Resume draft list + CTA points at /create/new"
```

---

## Task 7 — Manual smoke test

**Files:** none.

- [ ] **Step 1: Boot dev + Inngest** (`npm run dev`, `npx inngest-cli@latest dev`).

- [ ] **Step 2: Sign up fresh user.** Land on `/`. Confirm hero CTA points at `/create/new`.

- [ ] **Step 3: Click "Start a book".** Lands on `/create/new` with a fresh `?draft=<id>` in the URL. Step 1.

- [ ] **Step 4: Walk steps 1–3.** Pick recipient, occasion, then on Step 3 click "Add your first character" → creates a character → returns to `/create/new?draft=<id>` on the cast step with the new character visible. Select it.

- [ ] **Step 5: Refresh on Step 4.** Mid-typing your outline, refresh. The page reloads to Step 4 (or wherever you'd progressed to last save) with all prior data intact.

- [ ] **Step 6: Walk to Step 7 + Generate.** Pick style + page count + review → click "Generate book". You're sent to `/stories/[id]/progress`, the wizard's draft row is deleted (verify in Supabase Table Editor).

- [ ] **Step 7: V2 pipeline runs end-to-end.** Same as Plan B's smoke — book renders.

- [ ] **Step 8: Multiple drafts.** Open `/create/new` in a second tab. Confirm the home `/` shows two Resume cards.

- [ ] **Step 9: Lint pass.** `npm run lint`.

---

## Plan C — completion criteria

- A fresh user can complete the entire flow from landing on `/` to a finished book without ever touching a CLI.
- Mid-flow drafts auto-save and resume from refresh + new tab + new device.
- Multiple parallel drafts show on the home Resume list.
- The wizard hands off to the V2 pipeline cleanly via `/api/generate/v2`.
