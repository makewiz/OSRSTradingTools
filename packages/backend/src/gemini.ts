import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

let clientInstance: GoogleGenAI | null = null;

export const DEFAULT_GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";

/**
 * Returns a singleton instance of GoogleGenAI client if GEMINI_API_KEY is configured.
 * Returns null if no API key is set.
 */
export function getGeminiClient(): GoogleGenAI | null {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return null;
    }
    if (!clientInstance) {
        clientInstance = new GoogleGenAI({ apiKey });
    }
    return clientInstance;
}
