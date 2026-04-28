// Shared circular pet avatar. Photo if the pet has one, otherwise a
// muted-palette badge with the pet's first initial. Same UX pattern as
// Slack/Gmail/GitHub — readable at any size, never relies on an emoji.
//
// Background color is derived deterministically from the pet's name so
// the same pet always renders the same color across sessions.

import type { Pet } from "@/lib/types";

interface Props {
  pet: Pick<Pet, "name" | "photos">;
  // px size of the circle. Default 40 (small chip). Pass 96/128 for
  // hero placements.
  size?: number;
  className?: string;
}

// Quiet palette tuned to the Legacy Brand colors — desaturated navy /
// moss / gold / mauve / sand / teal pairs. Each badge has a low-
// chroma background and a darker readable foreground.
const PALETTE: { bg: string; fg: string }[] = [
  { bg: "#dde3ed", fg: "#1a2840" }, // navy
  { bg: "#dde6d9", fg: "#2d5944" }, // moss
  { bg: "#f0e3c4", fg: "#87683a" }, // gold
  { bg: "#ece1cf", fg: "#6b4d2c" }, // tan
  { bg: "#e6dde9", fg: "#4a2849" }, // mauve
  { bg: "#dce5ea", fg: "#1f4a5f" }, // teal
  { bg: "#e9e1d4", fg: "#5a4a2c" }, // sand
  { bg: "#d8dde0", fg: "#3a4555" }, // slate
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
        className={`overflow-hidden rounded-full bg-cream-200 ${className}`}
        style={{ width: size, height: size }}
      >
        {/* Plain <img>: pet photos can come from any Supabase Storage
            URL and we don't want to thread next/image domain config. */}
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
