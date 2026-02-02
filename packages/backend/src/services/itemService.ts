import { getLatestItems } from '../scheduler';

// Note: CombinedItem is actually exported from osrsClient, but if scheduler exports it too we are good.
// Checking osrsClient.ts: CombinedItem is exported there. scheduler.ts imports it.
// If scheduler.ts doesn't export it, we should import from osrsClient.
// Checking scheduler.ts lines again...
// "import { getCombinedItems, CombinedItem, ... } from "./osrsClient";"
// It imports it but does not re-export it.
// So I should import CombinedItem from osrsClient.

import { CombinedItem } from '../osrsClient';

export interface ItemService {
    getLatestItems(): Promise<CombinedItem[]>;
}

export class ItemServiceImpl implements ItemService {
    async getLatestItems(): Promise<CombinedItem[]> {
        return getLatestItems();
    }
}

export const itemService = new ItemServiceImpl();
