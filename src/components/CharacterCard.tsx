import Link from "next/link";
import type { Character } from "@/lib/types";

export default function CharacterCard({ character }: { character: Character }) {
  const photo = character.reference_photo_urls[0];
  return (
    <Link
      href={`/characters/${character.id}`}
      className="block rounded-lg border bg-white hover:shadow-sm transition overflow-hidden"
    >
      <div className="aspect-square bg-stone-100 flex items-center justify-center">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo}
            alt={character.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="text-stone-400 text-sm">No photo yet</span>
        )}
      </div>
      <div className="p-3">
        <div className="flex items-center gap-2">
          <span className="font-medium">{character.name}</span>
          <span className="text-xs uppercase tracking-wide text-stone-500">
            {character.kind}
          </span>
        </div>
        {character.role_label && (
          <div className="text-sm text-stone-600">{character.role_label}</div>
        )}
      </div>
    </Link>
  );
}
