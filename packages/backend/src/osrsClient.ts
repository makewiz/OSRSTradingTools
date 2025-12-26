import { calculateDayChange } from "./database";

const MAPPING_URL = "https://prices.runescape.wiki/api/v1/osrs/mapping";
const LATEST_URL = "https://prices.runescape.wiki/api/v1/osrs/latest";
const VOLUMES_URL =
  "https://oldschool.runescape.wiki/?title=Module:GEVolumes/data.json&action=raw&ctype=application%2Fjson";

export interface OsrsItemMapping {
  id: number;
  name: string;
  examine: string;
  members: boolean;
  wiki_url: string;
  icon: string;
}

export interface OsrsLatestItem {
  high: number | null;
  highTime: number | null;
  low: number | null;
  lowTime: number | null;
}

export interface OsrsLatestResponse {
  data: Record<string, OsrsLatestItem>;
}

export type OsrsVolumesResponse = Record<string, number>;

export interface CombinedItem {
  id: number;
  name: string;
  examine: string;
  members: boolean;
  wikiUrl: string;
  iconUrl: string;
  buyPrice: number | null;
  sellPrice: number | null;
  margin: number | null;
  volume: number | null;
  dayChange: number | null; // 24h price change percentage
  marginVolume: number | null; // margin * volume
}

interface CacheEntry {
  items: CombinedItem[];
  fetchedAt: number;
}

const CACHE_TTL_MS = 60 * 1000; // 1 minute hobby cache
let cache: CacheEntry | null = null;

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "OSRSTradingTools hobby app (contact: unknown)"
    }
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }

  return (await res.json()) as T;
}

export async function getCombinedItems(): Promise<CombinedItem[]> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.items;
  }

  const [mapping, latest, volumes] = await Promise.all([
    fetchJson<OsrsItemMapping[]>(MAPPING_URL),
    fetchJson<OsrsLatestResponse>(LATEST_URL),
    fetchJson<OsrsVolumesResponse>(VOLUMES_URL)
  ]);

  const items: CombinedItem[] = mapping.map((m) => {
    const latestEntry = latest.data[String(m.id)];
    const volume = volumes[String(m.id)];

    const buyPrice = latestEntry?.low ?? null;
    const sellPrice = latestEntry?.high ?? null;
    const margin =
      buyPrice !== null && sellPrice !== null ? sellPrice - buyPrice : null;

    // Calculate day change from database
    const { dayChange } = calculateDayChange(m.id, buyPrice, sellPrice);

    // Calculate margin * volume
    const marginVolume =
      margin !== null && typeof volume === "number" && volume > 0
        ? margin * volume
        : null;

    return {
      id: m.id,
      name: m.name,
      examine: m.examine,
      members: m.members,
      wikiUrl: m.wiki_url,
      iconUrl: m.icon,
      buyPrice,
      sellPrice,
      margin,
      volume: typeof volume === "number" ? volume : null,
      dayChange,
      marginVolume
    };
  });

  cache = { items, fetchedAt: now };
  return items;
}


