import Link from "next/link";
import type { Character } from "@/lib/types";

export default function CharacterCard({ character }: { character: Character }) {
  const photo = character.reference_photo_urls[0];
  return (
    <Link
      href={`/characters/${character.id}`}
      className="block overflow-hidden rounded-2xl border border-cream-300 bg-cream-50 shadow-[0_1px_2px_rgba(14,26,43,0.04)] transition-all hover:-translate-y-1 hover:border-gold-500 hover:shadow-[0_12px_32px_rgba(14,26,43,0.10)]"
    >
      <div className="flex aspect-square items-center justify-center bg-cream-200">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo}
            alt={character.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="text-sm text-ink-300">No photo yet</span>
        )}
      </div>
      <div className="p-3">
        <div className="flex items-center gap-2">
          <span className="font-medium text-ink-900">{character.name}</span>
          <span className="text-xs uppercase tracking-wide text-ink-500">
            {character.kind}
          </span>
        </div>
        {character.role_label && (
          <div className="text-sm text-ink-700">{character.role_label}</div>
        )}
      </div>
    </Link>
  );
}
