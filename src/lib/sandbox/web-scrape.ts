import "server-only";
import { lookup } from "node:dns/promises";
import net from "node:net";

const FETCH_TIMEOUT_MS = 10_000;
const MAX_HTML_BYTES = 512_000;
const MAX_EXTRACTED_CHARS = 12_000;

export type ScrapedPage = {
  url: string;
  status: number;
  title: string;
  description: string;
  headings: string[];
  text: string;
  wordCount: number;
};

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map((n) => Number.parseInt(n, 10));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts as [number, number, number, number];
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true; // link-local & cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // multicast / reserved
  return false;
}

function isPrivateIp(ip: string): boolean {
  const normalized = ip.trim().toLowerCase();
  if (net.isIPv4(normalized)) return isPrivateIpv4(normalized);
  if (net.isIPv6(normalized)) {
    if (normalized === "::1" || normalized === "::") return true;
    if (normalized.startsWith("::ffff:")) {
      const v4 = normalized.slice("::ffff:".length);
      return net.isIPv4(v4) ? isPrivateIpv4(v4) : true;
    }
    if (/^(?:fc|fd|fe[89ab])/i.test(normalized)) return true; // ULA / link-local
    return false;
  }
  return true;
}

/** Validates a public http(s) URL and rejects localhost/private/metadata targets. */
export async function assertSafePublicUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    throw new Error(`Invalid URL: "${rawUrl}"`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http:// and https:// URLs are allowed.");
  }
  const host = url.hostname.toLowerCase();
  if (
    !host ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    throw new Error(`Blocked private or local host: "${host}"`);
  }
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new Error(`Blocked private IP address: "${host}"`);
    return url;
  }
  try {
    const records = await lookup(host, { all: true });
    if (records.length === 0) throw new Error(`Could not resolve host "${host}".`);
    for (const rec of records) {
      if (isPrivateIp(rec.address)) {
        throw new Error(`Blocked host "${host}" resolving to private IP.`);
      }
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Blocked")) throw err;
    throw new Error(`Could not resolve host "${host}".`);
  }
  return url;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_m, code) => {
      const n = Number.parseInt(String(code), 10);
      return Number.isFinite(n) && n > 0 && n < 0x10ffff ? String.fromCodePoint(n) : "";
    })
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex) => {
      const n = Number.parseInt(String(hex), 16);
      return Number.isFinite(n) && n > 0 && n < 0x10ffff ? String.fromCodePoint(n) : "";
    });
}

function stripTags(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

/** Extracts clean, human-readable text, title, description, and headings from HTML. */
export function extractTextFromHtml(html: string, url: string, status = 200): ScrapedPage {
  const titleMatch = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const title = titleMatch ? stripTags(titleMatch[1] ?? "") : "";

  const descMatch =
    /<meta\b[^>]*name=["']description["'][^>]*content=["']([^"']+)["'][^>]*>/i.exec(html) ??
    /<meta\b[^>]*content=["']([^"']+)["'][^>]*name=["']description["'][^>]*>/i.exec(html);
  const description = descMatch ? decodeHtmlEntities(descMatch[1] ?? "").trim() : "";

  // Remove non-content blocks first
  const cleaned = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|iframe|template|head)\b[^>]*>[\s\S]*?<\/\1>/gi, " ");

  const headings: string[] = [];
  const headingRe = /<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/gi;
  let hm: RegExpExecArray | null;
  while ((hm = headingRe.exec(cleaned)) !== null && headings.length < 25) {
    const h = stripTags(hm[1] ?? "");
    if (h && !headings.includes(h)) headings.push(h.slice(0, 180));
  }

  // Convert structural tags to newlines so paragraphs remain readable
  const withBreaks = cleaned
    .replace(/<(?:br|hr)\b[^>]*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|section|article|main|li|tr|h[1-6]|blockquote|pre|header|footer|dd|dt)>/gi, "\n");

  const lines = decodeHtmlEntities(withBreaks.replace(/<[^>]+>/g, " "))
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter((line) => line.length > 0);

  // Deduplicate immediate repeated boilerplate lines
  const deduped: string[] = [];
  for (const line of lines) {
    if (deduped.at(-1) !== line) deduped.push(line);
  }

  const rawText = deduped.join("\n");
  const text =
    rawText.length > MAX_EXTRACTED_CHARS
      ? `${rawText.slice(0, MAX_EXTRACTED_CHARS)}\n…[truncated at ${MAX_EXTRACTED_CHARS} chars]`
      : rawText;
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;

  return {
    url,
    status,
    title,
    description,
    headings,
    text,
    wordCount,
  };
}

/** Formats scraped page metadata and text cleanly for Proxima's command prompt output. */
export function formatScrapedPage(page: ScrapedPage): string {
  const parts: string[] = [`URL: ${page.url} (HTTP ${page.status}, ${page.wordCount} words)`];
  if (page.title) parts.push(`Title: ${page.title}`);
  if (page.description) parts.push(`Description: ${page.description}`);
  if (page.headings.length > 0) {
    parts.push(`Key Headings:\n${page.headings.slice(0, 12).map((h) => `- ${h}`).join("\n")}`);
  }
  parts.push(`\nExtracted Text:\n${page.text}`);
  return parts.join("\n");
}

/** Safely fetches a public web page and extracts clean readable text (SSRF-hardened). */
export async function fetchAndScrapeUrl(
  rawUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ScrapedPage> {
  const safeUrl = await assertSafePublicUrl(rawUrl);

  const response = await fetchImpl(safeUrl.toString(), {
    method: "GET",
    redirect: "follow",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: {
      "User-Agent": "ProximaBot/1.0 (+https://proxima.ai; text-extraction)",
      Accept: "text/html,application/xhtml+xml,text/plain,application/json;q=0.9,*/*;q=0.5",
    },
  });

  // Re-verify final URL after redirects against SSRF rules
  if (response.url && response.url !== safeUrl.toString()) {
    await assertSafePublicUrl(response.url);
  }

  const finalUrl = response.url || safeUrl.toString();
  const contentType = response.headers.get("content-type") ?? "";
  const rawBody = await response.text();
  const bounded = rawBody.slice(0, MAX_HTML_BYTES);

  if (contentType.includes("text/plain") || contentType.includes("application/json")) {
    const trimmed = bounded.slice(0, MAX_EXTRACTED_CHARS);
    return {
      url: finalUrl,
      status: response.status,
      title: "",
      description: "",
      headings: [],
      text: trimmed,
      wordCount: trimmed.trim() ? trimmed.trim().split(/\s+/).length : 0,
    };
  }

  return extractTextFromHtml(bounded, finalUrl, response.status);
}
