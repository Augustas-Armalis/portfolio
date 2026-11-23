// What the scene's three music files are, as their licences ask them to be credited (lib/musicDirector.ts plays
// them; Settings → Sound and the scene's settings show these lines). null: nothing to credit (his own, or silence).
// Change a line here when its file in public/content/music is replaced, and in CREDITS.md.
export const MUSIC_CREDIT: Record<"field" | "forest" | "sea", string | null> = {
  field: null, // field.mp3: his own, "Tikra giria"
  forest: null, // forest.mp3: his own, "Vieškelis"
  sea: null, // sea.mp3: his own, "Paplūdimys"
};
export const MUSIC_CREDITS = Object.values(MUSIC_CREDIT).filter((c): c is string => !!c);
