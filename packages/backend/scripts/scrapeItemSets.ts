import fs from 'fs';
import path from 'path';

// --- Configuration ---
const MAPPING_URL = "https://prices.runescape.wiki/api/v1/osrs/mapping";
const WIKI_API_URL = "https://oldschool.runescape.wiki/api.php";
const OUTPUT_FILE = path.join(__dirname, '../src/data/itemSets.ts');

interface ItemMapping {
    id: number;
    name: string;
}

interface ItemSetDef {
    id: number;
    name: string;
    componentIds: number[];
}

// --- Helpers ---

async function fetchJson<T>(url: string): Promise<T> {
    const res = await fetch(url, {
        headers: { 'User-Agent': 'OSRSTradingTools Scraper' }
    });
    if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.statusText}`);
    return (await res.json()) as T;
}

// Fetch Mapping (Name -> ID)
async function getMapping(): Promise<Map<string, number>> {
    console.log("Fetching Item Mapping...");
    const data = await fetchJson<ItemMapping[]>(MAPPING_URL);
    const map = new Map<string, number>();
    for (const item of data) {
        map.set(item.name.toLowerCase(), item.id);
    }
    console.log(`Loaded ${map.size} items.`);
    return map;
}

// Fetch Category Members
async function getCategoryMembers(category: string): Promise<string[]> {
    console.log(`Fetching members of Category:${category}...`);
    let members: string[] = [];
    let continueToken = '';

    do {
        const url = `${WIKI_API_URL}?action=query&list=categorymembers&cmtitle=Category:${category}&cmlimit=500&format=json&origin=*${continueToken ? '&cmcontinue=' + continueToken : ''}`;
        const res = await fetchJson<any>(url);

        if (res.query && res.query.categorymembers) {
            for (const member of res.query.categorymembers) {
                members.push(member.title);
            }
        }

        if (res.continue && res.continue.cmcontinue) {
            continueToken = res.continue.cmcontinue;
        } else {
            continueToken = '';
        }
    } while (continueToken);

    console.log(`Found ${members.length} pages in category.`);
    return members;
}

// Fetch Wikitext for a batch of titles
async function fetchWikitextBatch(titles: string[]): Promise<Record<string, string>> {
    // Wiki API limits titles per request (usually 50)
    const url = `${WIKI_API_URL}?action=query&prop=revisions&rvprop=content&format=json&origin=*&titles=${encodeURIComponent(titles.join('|'))}`;
    const res = await fetchJson<any>(url);

    const results: Record<string, string> = {};
    if (res.query && res.query.pages) {
        for (const pageId in res.query.pages) {
            const page = res.query.pages[pageId];
            if (page.revisions && page.revisions.length > 0) {
                results[page.title] = page.revisions[0]['*'];
            }
        }
    }
    return results;
}

// Main Scraper
async function run() {
    try {
        const nameToId = await getMapping();
        const pages = await getCategoryMembers("Item_sets");

        const foundSets: ItemSetDef[] = [];

        // Batch process pages
        const BATCH_SIZE = 40;
        for (let i = 0; i < pages.length; i += BATCH_SIZE) {
            const batch = pages.slice(i, i + BATCH_SIZE);
            console.log(`Processing batch ${i} to ${Math.min(i + BATCH_SIZE, pages.length)}...`);

            const wikitexts = await fetchWikitextBatch(batch);

            for (const title of batch) {
                const wikitext = wikitexts[title];
                if (!wikitext) continue;

                // 1. Identify valid sets
                // Must have {{Item set}} or {{CostTableHead}}
                // Logic: Look for components using regex

                // Regex for CostLine: {{CostLine|Item Name}} or {{CostLine|Item Name|...}}
                const costLineRegex = /{{CostLine\|([^}|]+)/g;
                let match;
                const components: string[] = [];

                while ((match = costLineRegex.exec(wikitext)) !== null) {
                    components.push(match[1].trim());
                }

                if (components.length > 0) {
                    // This page has components. Is the page itself an item?
                    // Resolve ID for the set (Title)
                    const setId = nameToId.get(title.toLowerCase());

                    if (setId) {
                        // Resolve IDs for components
                        const componentIds: number[] = [];
                        let allResolved = true;

                        for (const compName of components) {
                            const compId = nameToId.get(compName.toLowerCase());
                            if (compId) {
                                componentIds.push(compId);
                            } else {
                                // console.warn(`Could not resolve component ID for: ${compName} (in set ${title})`);
                                allResolved = false;
                            }
                        }

                        if (allResolved && componentIds.length > 1) {
                            foundSets.push({
                                id: setId,
                                name: title,
                                componentIds: componentIds
                            });
                        }
                    } else {
                        // console.warn(`Could not resolve Set ID for page: ${title}`);
                    }
                }
            }
        }

        console.log(`\nScraping complete. Found ${foundSets.length} valid item sets.`);

        // Generate File Content
        const fileContent = `// Common Item Sets
// GENERATED BY SCRAPER - DO NOT EDIT MANUALLY
// Scraped at: ${new Date().toISOString()}

export interface ItemSet {
    id: number;
    name: string;
    componentIds: number[];
}

export const ITEM_SETS: ItemSet[] = ${JSON.stringify(foundSets, null, 4)};
`;

        fs.writeFileSync(OUTPUT_FILE, fileContent);
        console.log(`Wrote ${foundSets.length} sets to ${OUTPUT_FILE}`);

    } catch (err) {
        console.error("Scraper failed:", err);
    }
}

run();
