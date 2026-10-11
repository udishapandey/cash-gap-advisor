export type Language = "en" | "hi";
export const LANGUAGES: Language[] = ["en", "hi"];
export const LANGUAGE_LABELS: Record<Language, string> = { en: "English", hi: "हिन्दी" };
/** The name given to the AI in prompts. Hindi is written in Devanagari, but numbers stay as 0-9 digits. */
export const LANGUAGE_NAMES: Record<Language, string> = { en: "English", hi: "Hindi (Devanagari script)" };
