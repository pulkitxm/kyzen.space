// Loads emoji-mart's data lazily (it's ~1.5MB) and derives a shortcode->native
// map (for `:code ` replacement) and category groups (for the picker grid).

type RawEmoji = {
  id: string;
  name: string;
  keywords?: string[];
  skins?: { native: string }[];
};
type EmojiMartData = {
  categories: { id: string; emojis: string[] }[];
  emojis: Record<string, RawEmoji>;
  aliases?: Record<string, string>;
};

export type EmojiGroup = {
  id: string;
  emojis: { id: string; native: string; keywords: string[] }[];
};

const CUSTOM_ALIASES: Record<string, string> = {
  haha: "joy",
  lol: "joy",
  lmao: "rolling_on_the_floor_laughing",
  smile: "smiley",
  sad: "cry",
  love: "heart",
  thumbsup: "+1",
  thumbsdown: "-1",
  fire: "fire",
  ok: "ok_hand",
};

let dataPromise: Promise<EmojiMartData> | null = null;
let shortcodesCache: Map<string, string> | null = null;
let groupsCache: EmojiGroup[] | null = null;

async function loadData(): Promise<EmojiMartData> {
  if (!dataPromise) {
    dataPromise = import("@slidoapp/emoji-mart-data").then(
      (m) =>
        ((m as { default?: EmojiMartData }).default ??
          (m as unknown as EmojiMartData)) as EmojiMartData,
    );
  }
  return dataPromise;
}

const nativeOf = (data: EmojiMartData, id: string) =>
  data.emojis[id]?.skins?.[0]?.native;

/** Map of `shortcode` -> native emoji (emoji ids + aliases + a few custom). */
export async function loadShortcodes(): Promise<Map<string, string>> {
  if (shortcodesCache) return shortcodesCache;
  const data = await loadData();
  const map = new Map<string, string>();
  for (const id of Object.keys(data.emojis)) {
    const n = nativeOf(data, id);
    if (n) map.set(id, n);
  }
  for (const [alias, id] of Object.entries(data.aliases ?? {})) {
    const n = nativeOf(data, id);
    if (n) map.set(alias, n);
  }
  for (const [alias, id] of Object.entries(CUSTOM_ALIASES)) {
    const n = nativeOf(data, id);
    if (n) map.set(alias, n);
  }
  shortcodesCache = map;
  return map;
}

/** Category groups of native emojis (with searchable keywords) for the picker. */
export async function loadEmojiGroups(): Promise<EmojiGroup[]> {
  if (groupsCache) return groupsCache;
  const data = await loadData();
  groupsCache = data.categories.map((c) => ({
    id: c.id,
    emojis: c.emojis.flatMap((id) => {
      const e = data.emojis[id];
      const native = e ? nativeOf(data, id) : undefined;
      if (!e || !native) return [];
      return [
        {
          id,
          native,
          keywords: [id, e.name, ...(e.keywords ?? [])].map((k) =>
            k.toLowerCase(),
          ),
        },
      ];
    }),
  }));
  return groupsCache;
}
