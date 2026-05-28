const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ж: "zh", з: "z",
  и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p",
  р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch",
  ш: "sh", щ: "sht", ъ: "a", ь: "", ю: "yu", я: "ya",
};

function transliterate(input: string): string {
  let out = "";
  for (const ch of input) {
    const lower = ch.toLowerCase();
    if (lower in CYRILLIC_TO_LATIN) {
      out += CYRILLIC_TO_LATIN[lower];
    } else {
      out += lower;
    }
  }
  return out;
}

export function generateSlug(name: string): string {
  return transliterate(name)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
