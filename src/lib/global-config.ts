import rawConfig from "../../config.json";

/**
 * Single typed access point for the root `/config.json` file.
 * Safe for both server and browser bundles (contains no secret API keys).
 *
 * Edit `/config.json` to customize Proxima's name, version, developers,
 * AI models (NVIDIA / OpenRouter / Render), speech voices, timeouts, and
 * feature switches in one place.
 */
export const globalConfig = rawConfig;
export type GlobalConfig = typeof rawConfig;
