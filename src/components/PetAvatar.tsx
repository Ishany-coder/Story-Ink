// Shared circular pet avatar. Photo if the pet has one, otherwise a
// colored badge with the pet's first initial — the same pattern Slack /
// Gmail / GitHub use. Far cleaner than species emojis and works at any
// size.
//
// Background color is derived from the pet's name so the same pet always
// renders with the same color.

import type { Pet } from "@/lib/types";

interface Props {
  pet: Pick<Pet, "name" | "photos">;
  // px size of the circle. Default 40 (small chip). Pass 96/128/etc
  // for hero placements.
  size?: number;
  className?: string;
}

// Hand-picked pastel pairs — soft enough for a warm UI, distinct enough
// that two different pets read differently when sat next to each other.
const PALETTE: { bg: string; fg: string }[] = [
  { bg: "#fde7e1", fg: "#a23a1f" }, // peach
  { bg: "#e8e7fd", fg: "#3f3a9c" }, // periwinkle
  { bg: "#e0f2e6", fg: "#2f6a45" }, // sage
  { bg: "#fce8f4", fg: "#a02b71" }, // rose
  { bg: "#fdf3d3", fg: "#8a6914" }, // honey
  { bg: "#dff0f7", fg: "#1f5a76" }, // sky
  { bg: "#efe6dc", fg: "#6b4d2c" }, // tan
  { bg: "#f0e3f7", fg: "#6b2192" }, // lilac
];

function colorFor(name: string): { bg: string; fg: string } {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

export default function PetAvatar({ pet, size = 40, className = "" }: Props) {
  const photo = pet.photos[0] ?? null;
  const initial = pet.name.trim().charAt(0).toUpperCase() || "?";
  const { bg, fg } = colorFor(pet.name);

  if (photo) {
    return (
      <div
        className={`overflow-hidden rounded-full bg-stone-100 ${className}`}
        style={{ width: size, height: size }}
      >
        {/* Plain <img>: pet photos can come from any Supabase Storage
            URL and we don't want to thread next/image domain config
            for them. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo}
          alt={pet.name}
          className="h-full w-full object-cover"
        />
      </div>
    );
  }

  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full font-[family-name:var(--font-display)] font-semibold ${className}`}
      style={{
        width: size,
        height: size,
        backgroundColor: bg,
        color: fg,
        fontSize: Math.round(size * 0.42),
      }}
      aria-hidden="true"
    >
      {initial}
    </div>
  );
}
