import { getLatestPricesBefore } from "./database";
import { calculateTax, calculateProfit, calculateROI } from "./tax";

const MAPPING_URL = "https://prices.runescape.wiki/api/v1/osrs/mapping";
const LATEST_URL = "https://prices.runescape.wiki/api/v1/osrs/latest";
const FIVE_MIN_URL = "https://prices.runescape.wiki/api/v1/osrs/5m";
const TIMESERIES_URL = "https://prices.runescape.wiki/api/v1/osrs/timeseries";
const VOLUMES_URL =
  "https://oldschool.runescape.wiki/?title=Module:GEVolumes/data.json&action=raw&ctype=application%2Fjson";
const WIKI_API_URL = "https://oldschool.runescape.wiki/api.php";

export interface OsrsItemMapping {
  id: number;
  name: string;
  examine: string;
  members: boolean;
  wiki_url: string;
  icon: string;
  limit?: number;
  highalch?: number;
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

export interface WikiTimeSeriesItem {
  timestamp: number;
  avgHighPrice: number | null;
  avgLowPrice: number | null;
  highPriceVolume: number | null;
  lowPriceVolume: number | null;
}

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
  highAlch: number | null;
  highAlchProfit: number | null;
  highAlchRoi: number | null;
  highAlchProfitPerHour: number | null; // Profit based on max casts (1200/hr) and buy limit
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
      "User-Agent": `OSRSTradingTools hobby app (contact: ${process.env.WIKI_CONTACT_INFO || "unknown"})`
    }
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }

  return (await res.json()) as T;
}

export async function getMapping(): Promise<OsrsItemMapping[]> {
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

export async function fetchWikiTimeSeries(id: number, timestep: string): Promise<WikiTimeSeriesItem[]> {
  const url = `${TIMESERIES_URL}?id=${id}&timestep=${timestep}`;
  // The timeseries endpoint returns { data: [...] }
  const response = await fetchJson<{ data: WikiTimeSeriesItem[] }>(url);
  return response.data;
}

export async function getCombinedItems(): Promise<CombinedItem[]> {
  const [mapping, latest, fiveMin, volumes] = await Promise.all([
    getMapping(),
    getLatest(),
    get5m(),
    getVolumes()
  ]);

  // Batch fetch historical prices to avoid N+1 queries
  const itemIds = mapping.map(m => m.id);
  const now = Math.floor(Date.now() / 1000);
  const timeAgo24h = now - 24 * 60 * 60;
  const timeAgo1h = now - 60 * 60;

  // Fetch 24h history (using 1h table for safety against 24h retention on 5m table)
  // Fetch 1h history (using 5m table for best granularity)
  const prices24hPromise = getLatestPricesBefore(itemIds, timeAgo24h, 'item_history_1h');
  const prices1hPromise = getLatestPricesBefore(itemIds, timeAgo1h, 'item_history_5m');

  const [prices24h, prices1h] = await Promise.all([prices24hPromise, prices1hPromise]);

  // Get current nature rune price (ID 561)
  const natureRuneId = 561;
  const natureRuneLatest = latest.data[String(natureRuneId)];
  const natureRunePrice = natureRuneLatest ? (natureRuneLatest.low ?? natureRuneLatest.high ?? 0) : 0;


  const items = mapping.map((m) => {
    const latestEntry = latest.data[String(m.id)];
    const fiveMinEntry = fiveMin.data[String(m.id)];
    const volume = volumes[m.name];

    const buyPrice = latestEntry?.high ?? null;
    const sellPrice = latestEntry?.low ?? null;
    const margin =
      buyPrice !== null && sellPrice !== null ? buyPrice - sellPrice : null;

    // --- Calculate Day Change (24h) ---
    // Was: calculateDayChange(m.id, buyPrice, sellPrice)
    // Now: use prices24h map
    let dayChange: number | null = null;
    const oldPrice24h = prices24h[m.id];
    if (oldPrice24h) {
      let buyChange: number | null = null;
      if (buyPrice !== null && oldPrice24h.avgHigh) {
        buyChange = ((buyPrice - oldPrice24h.avgHigh) / oldPrice24h.avgHigh) * 100;
      }
      let sellChange: number | null = null;
      if (sellPrice !== null && oldPrice24h.avgLow) {
        sellChange = ((sellPrice - oldPrice24h.avgLow) / oldPrice24h.avgLow) * 100;
      }
      if (buyChange !== null && sellChange !== null) {
        dayChange = (buyChange + sellChange) / 2;
      } else if (buyChange !== null) {
        dayChange = buyChange;
      } else if (sellChange !== null) {
        dayChange = sellChange;
      }
    }

    // --- Calculate Hour Change (1h) ---
    // Was: calculateHourChange(m.id, buyPrice, sellPrice)
    // Now: use prices1h map
    let hourChange: number | null = null;
    const oldPrice1h = prices1h[m.id];
    if (oldPrice1h) {
      let buyChange: number | null = null;
      if (buyPrice !== null && oldPrice1h.avgHigh) {
        buyChange = ((buyPrice - oldPrice1h.avgHigh) / oldPrice1h.avgHigh) * 100;
      }
      let sellChange: number | null = null;
      if (sellPrice !== null && oldPrice1h.avgLow) {
        sellChange = ((sellPrice - oldPrice1h.avgLow) / oldPrice1h.avgLow) * 100;
      }
      if (buyChange !== null && sellChange !== null) {
        hourChange = (buyChange + sellChange) / 2;
      } else if (buyChange !== null) {
        hourChange = buyChange;
      } else if (sellChange !== null) {
        hourChange = sellChange;
      }
    }

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
      tax = calculateTax(buyPrice, m.name);
      profit = calculateProfit(buyPrice, sellPrice, m.name);
      roi = calculateROI(buyPrice, sellPrice, m.name);

      if (m.limit && m.limit > 0) {
        potentialProfit = profit * m.limit;
      }
    }

    // Calculate High Alch Metrics
    let highAlchProfit: number | null = null;
    let highAlchRoi: number | null = null;
    let highAlchProfitPerHour: number | null = null;
    const highAlch = m.highalch || null;

    if (highAlch !== null && buyPrice !== null && natureRunePrice > 0) {
      const totalCost = buyPrice + natureRunePrice;
      highAlchProfit = highAlch - totalCost;
      if (totalCost > 0) {
        highAlchRoi = (highAlchProfit / totalCost) * 100;

        // Profit Per Hour Calculation
        // 1. Max casts per hour = 1200 (5 ticks = 3s. 3600s / 3s = 1200)
        // 2. Item Limit constraints: Limit is per 4 hours.
        //    Hourly limit = limit / 4.
        const maxCastsPerHour = 1200;
        const itemLimit = m.limit || 0; // Assume 0 if unknown to be safe (or could be Infinity if we want to risk it)
        const hourlyLimit = itemLimit / 4;

        // Effective casts is min of max theoretical and what we can actually buy
        const effectiveCastsPerHour = Math.min(maxCastsPerHour, hourlyLimit);

        highAlchProfitPerHour = highAlchProfit * effectiveCastsPerHour;
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
      lastBuyTime: latestEntry?.highTime ?? null,
      lastSellTime: latestEntry?.lowTime ?? null,
      lastBuyVolume: fiveMinEntry?.highPriceVolume ?? null,
      lastSellVolume: fiveMinEntry?.lowPriceVolume ?? null,
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
      potentialProfit,
      highAlch,
      highAlchProfit,
      highAlchRoi,
      highAlchProfitPerHour
    };
  });

  return items;
}

export async function fetchWikiDescription(itemName: string): Promise<string | null> {
  const url = `${WIKI_API_URL}?action=query&prop=extracts&exintro&explaintext&titles=${encodeURIComponent(itemName)}&format=json`;
  try {
    const response = await fetchJson<any>(url);
    const pages = response?.query?.pages;
    if (!pages) return null;

    // keys are page IDs, e.g. "54321": { ... }
    const pageId = Object.keys(pages)[0];
    if (pageId === "-1") return null; // Page not found

    return pages[pageId].extract || null;
  } catch (err) {
    // console.error("Error fetching wiki description:", err);
    return null;
  }
}
