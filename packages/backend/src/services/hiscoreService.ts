import { logger } from "@osrstradingtools/shared";

const HISCORE_API_URL = "https://secure.runescape.com/m=hiscore_oldschool/index_lite.ws";

export interface PlayerSkills {
    [skill: string]: number;
}

// OSRS Hiscore order in CSV
const SKILL_ORDER = [
    "Overall", "Attack", "Defence", "Strength", "Hitpoints", "Ranged",
    "Prayer", "Magic", "Cooking", "Woodcutting", "Fletching", "Fishing",
    "Firemaking", "Crafting", "Smithing", "Mining", "Herblore", "Agility",
    "Thieving", "Slayer", "Farming", "Runecraft", "Hunter", "Construction"
];

export class HiscoreService {
    public async fetchUserStats(username: string): Promise<PlayerSkills> {
        try {
            const url = `${HISCORE_API_URL}?player=${encodeURIComponent(username)}`;
            logger.info(`[HiscoreService] Fetching stats for ${username}`);

            const res = await fetch(url);
            if (!res.ok) {
                if (res.status === 404) throw new Error("Player not found");
                throw new Error(`Failed to fetch hiscores: ${res.statusText}`);
            }

            const text = await res.text();
            const lines = text.split("\n");
            const skills: PlayerSkills = {};

            // Parse first N lines corresponding to skills
            for (let i = 0; i < SKILL_ORDER.length; i++) {
                if (i >= lines.length) break;

                const parts = lines[i].split(",");
                // Format: Rank, Level, XP
                if (parts.length >= 2) {
                    const level = parseInt(parts[1]);
                    // Only map if valid number
                    if (!isNaN(level) && level > 0) {
                        skills[SKILL_ORDER[i]] = level;
                    }
                }
            }

            return skills;
        } catch (err: any) {
            logger.error(`[HiscoreService] Error fetching ${username}`, err);
            throw err;
        }
    }
}

export const hiscoreService = new HiscoreService();
