import { calculateDayChange, calculateHourChange } from "./database";
import { calculateTax, calculateProfit, calculateROI } from "./tax";

const MAPPING_URL = "https://prices.runescape.wiki/api/v1/osrs/mapping";
const LATEST_URL = "https://prices.runescape.wiki/api/v1/osrs/latest";
const FIVE_MIN_URL = "https://prices.runescape.wiki/api/v1/osrs/5m";
const VOLUMES_URL =
  "https://oldschool.runescape.wiki/?title=Module:GEVolumes/data.json&action=raw&ctype=application%2Fjson";

export interface OsrsItemMapping {
  id: number;
  name: string;
  examine: string;
  members: boolean;
  wiki_url: string;
  icon: string;
  limit?: number;
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

export interface Osrs5mItem {
  avgHighPrice: number | null;
  highPriceVolume: number | null;
  avgLowPrice: number | null;
  lowPriceVolume: number | null;
}

export interface Osrs5mResponse {
  data: Record<string, Osrs5mItem>;
  timestamp: number;
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
  oneHourChange: number | null; // 1h price change percentage
  lastBuyTime: number | null; // Unix timestamp
  lastSellTime: number | null; // Unix timestamp
  lastBuyVolume: number | null; // volume at low price (5m)
  lastSellVolume: number | null; // volume at high price (5m)
  fiveMinTimestamp: number | null; // Timestamp from the 5m API Response
  avgHighPrice: number | null; // 5m average high price
  avgLowPrice: number | null; // 5m average low price
  highPriceVolume: number | null; // 5m high price volume
  lowPriceVolume: number | null; // 5m low price volume
  marginVolume: number | null; // margin * volume (Gross)
  limit: number | null;
  tax: number | null; // Tax per item
  profit: number | null; // Net margin per item (Sell - Tax - Buy)
  roi: number | null; // Return on Investment percentage
  potentialProfit: number | null; // Net Profit * Limit
}

interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}

const MAPPING_TTL = 24 * 60 * 60 * 1000; // 24 hours
const LATEST_TTL = 60 * 1000; // 1 minute
const VOLUMES_TTL = 10 * 60 * 1000; // 10 minutes

let mappingCache: CacheEntry<OsrsItemMapping[]> | null = null;
let latestCache: CacheEntry<OsrsLatestResponse> | null = null;
let fiveMinCache: CacheEntry<Osrs5mResponse> | null = null;
let volumesCache: CacheEntry<OsrsVolumesResponse> | null = null;

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

async function getMapping(): Promise<OsrsItemMapping[]> {
  const now = Date.now();
  if (mappingCache && now - mappingCache.fetchedAt < MAPPING_TTL) {
    return mappingCache.data;
  }
  const data = await fetchJson<OsrsItemMapping[]>(MAPPING_URL);
  mappingCache = { data, fetchedAt: now };
  return data;
}

async function getLatest(): Promise<OsrsLatestResponse> {
  const now = Date.now();
  if (latestCache && now - latestCache.fetchedAt < LATEST_TTL) {
    return latestCache.data;
  }
  const data = await fetchJson<OsrsLatestResponse>(LATEST_URL);
  latestCache = { data, fetchedAt: now };
  return data;
}

export async function get5m(): Promise<Osrs5mResponse> {
  const now = Date.now();
  if (fiveMinCache && now - fiveMinCache.fetchedAt < LATEST_TTL) {
    return fiveMinCache.data;
  }
  const data = await fetchJson<Osrs5mResponse>(FIVE_MIN_URL);
  fiveMinCache = { data, fetchedAt: now };
  return data;
}

async function getVolumes(): Promise<OsrsVolumesResponse> {
  const now = Date.now();
  if (volumesCache && now - volumesCache.fetchedAt < VOLUMES_TTL) {
    return volumesCache.data;
  }
  const data = await fetchJson<OsrsVolumesResponse>(VOLUMES_URL);
  volumesCache = { data, fetchedAt: now };
  return data;
}

export async function getCombinedItems(): Promise<CombinedItem[]> {
  const [mapping, latest, fiveMin, volumes] = await Promise.all([
    getMapping(),
    getLatest(),
    get5m(),
    getVolumes()
  ]);

  const items = await Promise.all(mapping.map(async (m) => {
    const latestEntry = latest.data[String(m.id)];
    const fiveMinEntry = fiveMin.data[String(m.id)];
    const volume = volumes[m.name];

    const buyPrice = latestEntry?.low ?? null;
    const sellPrice = latestEntry?.high ?? null;
    const margin =
      buyPrice !== null && sellPrice !== null ? sellPrice - buyPrice : null;

    // Calculate day change from database
    const { dayChange } = await calculateDayChange(m.id, buyPrice, sellPrice);
    const { hourChange } = await calculateHourChange(m.id, buyPrice, sellPrice);

    // Calculate margin * volume (Gross)
    const marginVolume =
      margin !== null && typeof volume === "number" && volume > 0
        ? margin * volume
        : null;

    // Calculate Tax Metrics
    let tax: number | null = null;
    let profit: number | null = null;
    let roi: number | null = null;
    let potentialProfit: number | null = null;

    if (buyPrice !== null && sellPrice !== null) {
      tax = calculateTax(sellPrice, m.name);
      profit = calculateProfit(buyPrice, sellPrice, m.name);
      roi = calculateROI(buyPrice, sellPrice, m.name);

      if (m.limit && m.limit > 0) {
        potentialProfit = profit * m.limit;
      }
    }

    return {
      id: m.id,
      name: m.name,
      examine: m.examine,
      members: m.members,
      wikiUrl: m.wiki_url || `https://oldschool.runescape.wiki/w/${m.name.replace(/ /g, '_')}`,
      iconUrl: `https://static.runelite.net/cache/item/icon/${m.id}.png`,
      buyPrice,
      sellPrice,
      margin,
      volume: typeof volume === "number" ? volume : null,
      dayChange,
      oneHourChange: hourChange,
      lastBuyTime: latestEntry?.lowTime ?? null,
      lastSellTime: latestEntry?.highTime ?? null,
      lastBuyVolume: fiveMinEntry?.lowPriceVolume ?? null,
      lastSellVolume: fiveMinEntry?.highPriceVolume ?? null,
      fiveMinTimestamp: fiveMin.timestamp ?? null,
      avgHighPrice: fiveMinEntry?.avgHighPrice ?? null,
      avgLowPrice: fiveMinEntry?.avgLowPrice ?? null,
      highPriceVolume: fiveMinEntry?.highPriceVolume ?? null,
      lowPriceVolume: fiveMinEntry?.lowPriceVolume ?? null,
      marginVolume,
      limit: m.limit ?? null,
      tax,
      profit,
      roi,
      potentialProfit
    };
  }));

  return items;
}
