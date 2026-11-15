import 'dotenv/config';
import { tavily } from '@tavily/core';

// Fail fast with a clear message instead of every search failing silently later.
const apiKey = process.env.TAVILY_API_KEY;
if (!apiKey) throw new Error('TAVILY_API_KEY is not set (see .env.example)');

const client = tavily({ apiKey });

// How many Tavily searches / page downloads run at once. Keeps us inside
// Tavily's rate limits and stops us hitting a recipe site with 20 requests in
// the same instant.
const SEARCH_CONCURRENCY = 5;
const EXTRACT_CONCURRENCY = 5;

export interface RecipeSlot {
  day: string;
  date: string;
  mealType: string;
  recipeName: string;
  cuisineHint: string;
  sourceSite: string;
}

export interface EnrichedRecipe extends RecipeSlot {
  sourceUrl: string | null;
  imageUrl: string | null;
  content: string | null;
}

// ── Small helpers ─────────────────────────────────────────────────────────────

// ── Timing logs ─────────────────────────────────────────────────────────────
// Shared [timing] logger (aiService imports it too) so every phase logs in
// one greppable format: `[timing] <phase>: 12.3s (12341ms)`. A slow run can
// then be diagnosed from the server log instead of guessed at.
export function timingLog(label: string, startedAt: number, extra = ''): void {
  const ms = Date.now() - startedAt;
  console.log(`[timing] ${label}: ${(ms / 1000).toFixed(1)}s (${ms}ms)${extra}`);
}

// Like Promise.all(items.map(fn)), but never runs more than `limit` at a time.
// Results keep the order of `items`. Exported so the day-synthesis step in
// aiService can reuse the same bounded parallelism.
export async function mapWithLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i] as T);
    }
  });
  await Promise.all(workers);
  return results;
}

// Gemini may answer "https://www.seriouseats.com/recipes" where Tavily wants "seriouseats.com".
function normalizeDomain(site: string): string {
  return site
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0] ?? '';
}

// ── Tavily search ─────────────────────────────────────────────────────────────
// Errors are NOT swallowed here: the caller needs to tell "no result found"
// (null) apart from "Tavily is broken" (bad key, out of credits, rate limited).

async function searchRecipeUrl(recipeName: string, sourceSite: string): Promise<string | null> {
  const domain = normalizeDomain(sourceSite);
  const res = await client.search(`${recipeName} recipe`, {
    maxResults: 1,
    searchDepth: 'basic',
    ...(domain ? { includeDomains: [domain] } : {}),
  });
  return res.results[0]?.url ?? null;
}

// ── JSON-LD extraction (primary) ──────────────────────────────────────────────
// Most recipe sites embed Schema.org Recipe structured data in JSON-LD blocks —
// the same data Google uses for recipe cards. It's pure signal: ingredients,
// steps, and nutrition with no blog prose.

async function fetchHtml(url: string): Promise<string | null> {
  if (!/^https?:\/\//i.test(url)) return null; // only ever download web pages
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; recipe-aggregator/1.0)' },
      signal: AbortSignal.timeout(8000),
    });
    // `await` matters: without it a failure while reading the body escapes this
    // try/catch and the Tavily fallback below never gets a chance to run.
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

function extractJsonLdBlocks(html: string): unknown[] {
  const blocks: unknown[] = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try { blocks.push(JSON.parse(m[1] ?? '')); } catch { /* skip malformed block */ }
  }
  return blocks;
}

// "@type" is usually "Recipe" but some sites write ["Recipe"] or ["Recipe", "Article"].
function isRecipeNode(x: unknown): x is Record<string, unknown> {
  if (!x || typeof x !== 'object') return false;
  const t = (x as Record<string, unknown>)['@type'];
  return t === 'Recipe' || (Array.isArray(t) && t.includes('Recipe'));
}

function findRecipeSchema(blocks: unknown[]): Record<string, unknown> | null {
  for (const block of blocks) {
    // A block can be one object or a top-level array of objects
    const nodes: unknown[] = Array.isArray(block) ? block : [block];
    for (const node of nodes) {
      if (isRecipeNode(node)) return node;
      // @graph pattern (very common — BreadcrumbList + Recipe in one block)
      const graph = (node as Record<string, unknown> | null)?.['@graph'];
      if (Array.isArray(graph)) {
        const r = graph.find(isRecipeNode);
        if (r) return r as Record<string, unknown>;
      }
    }
  }
  return null;
}

function extractImageUrl(schema: Record<string, unknown>): string | null {
  const img = schema.image;
  if (!img) return null;
  if (typeof img === 'string') return img;

  function urlFromObj(obj: unknown): string | null {
    if (!obj || typeof obj !== 'object') return null;
    const o = obj as Record<string, unknown>;
    if (typeof o.url === 'string' && o.url) return o.url;
    if (typeof o.contentUrl === 'string' && o.contentUrl) return o.contentUrl;
    return null;
  }

  if (Array.isArray(img)) {
    for (const item of img) {
      if (typeof item === 'string' && item) return item;
      const u = urlFromObj(item);
      if (u) return u;
    }
  }
  return urlFromObj(img);
}

function parseIsoDuration(iso: unknown): string {
  if (typeof iso !== 'string') return '';
  const m = iso.match(/P(?:.*?T)?(?:(\d+)H)?(?:(\d+)M)?/i);
  if (!m) return iso;
  const h = parseInt(m[1] ?? '0');
  const min = parseInt(m[2] ?? '0');
  if (h && min) return `${h}h ${min}min`;
  if (h) return `${h}h`;
  if (min) return `${min}min`;
  return iso;
}

function flattenInstructions(steps: unknown[]): string[] {
  return steps.flatMap((step) => {
    if (typeof step === 'string') return [step];
    if (!step || typeof step !== 'object') return [];
    const s = step as Record<string, unknown>;
    // HowToSection contains itemListElement
    if (s['@type'] === 'HowToSection' && Array.isArray(s.itemListElement)) {
      return flattenInstructions(s.itemListElement as unknown[]);
    }
    if (typeof s.text === 'string') return [s.text];
    return [];
  });
}

function formatRecipeSchema(schema: Record<string, unknown>): string {
  const lines: string[] = [];

  if (schema.name) lines.push(`Name: ${schema.name}`);
  if (schema.prepTime) lines.push(`Prep: ${parseIsoDuration(schema.prepTime)}`);
  if (schema.cookTime) lines.push(`Cook: ${parseIsoDuration(schema.cookTime)}`);
  const yld = schema.recipeYield;
  if (yld) lines.push(`Yield: ${Array.isArray(yld) ? yld[0] : yld}`);

  const ingredients = schema.recipeIngredient;
  if (Array.isArray(ingredients) && ingredients.length > 0) {
    lines.push('\nIngredients:');
    (ingredients as string[]).forEach((i) => lines.push(`- ${i}`));
  }

  const instructions = schema.recipeInstructions;
  if (Array.isArray(instructions) && instructions.length > 0) {
    lines.push('\nInstructions:');
    flattenInstructions(instructions).forEach((step, i) => lines.push(`${i + 1}. ${step}`));
  }

  const nutrition = schema.nutrition as Record<string, unknown> | undefined;
  if (nutrition) {
    const nLines: string[] = [];
    if (nutrition.calories)            nLines.push(`Calories: ${nutrition.calories}`);
    if (nutrition.carbohydrateContent) nLines.push(`Carbs: ${nutrition.carbohydrateContent}`);
    if (nutrition.fatContent)          nLines.push(`Fat: ${nutrition.fatContent}`);
    if (nutrition.proteinContent)      nLines.push(`Protein: ${nutrition.proteinContent}`);
    if (nutrition.fiberContent)        nLines.push(`Fiber: ${nutrition.fiberContent}`);
    if (nutrition.sodiumContent)       nLines.push(`Sodium: ${nutrition.sodiumContent}`);
    if (nutrition.sugarContent)        nLines.push(`Sugar: ${nutrition.sugarContent}`);
    if (nLines.length > 0) {
      lines.push('\nNutrition (per serving):');
      nLines.forEach((l) => lines.push(l));
    }
  }

  return lines.join('\n');
}

// ── Tavily Extract fallback (for sites without JSON-LD or behind WAFs) ────────
// Scan the raw text for the ingredient section and window from there; fall
// back to the last portion of the text since recipe cards are often at the end.

const TAVILY_WINDOW = 4000;

async function tavilyExtractFallback(url: string): Promise<string | null> {
  try {
    const res = await client.extract([url]);
    const raw = res.results[0]?.rawContent ?? '';
    if (!raw) return null;
    if (raw.length <= TAVILY_WINDOW) return raw;

    const lower = raw.toLowerCase();
    const idx = lower.indexOf('ingredient');
    if (idx !== -1) {
      const start = Math.max(0, idx - 150);
      return raw.slice(start, start + TAVILY_WINDOW);
    }
    return raw.slice(-TAVILY_WINDOW);
  } catch {
    return null;
  }
}

// ── Multi-source image extraction ────────────────────────────────────────────

function isLogoOrIcon(url: string): boolean {
  const u = url.toLowerCase();
  return ['logo', 'icon', 'favicon', 'placeholder', 'default', 'noimage', 'no-image', 'banner']
    .some((kw) => u.includes(kw));
}

function metaContent(html: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = html.match(re);
    const url = m?.[1];
    if (url && url.startsWith('http')) return url;
  }
  return null;
}

function pickBestImage(candidates: (string | null)[]): string | null {
  const valid = candidates.filter((u): u is string => !!u && u.startsWith('http'));
  return valid.find((u) => !isLogoOrIcon(u)) ?? valid[0] ?? null;
}

function extractHtmlImages(html: string, schema: Record<string, unknown> | null): string | null {
  const candidates: (string | null)[] = [];

  // 1. JSON-LD schema image — most reliable when present
  if (schema) candidates.push(extractImageUrl(schema));

  // 2. og:image
  candidates.push(metaContent(html, [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
  ]));

  // 3. twitter:image (common on Asian recipe blogs)
  candidates.push(metaContent(html, [
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i,
    /<meta[^>]+property=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
  ]));

  // 4. Microdata itemprop="image" (used by many Asian/indie food sites)
  candidates.push(metaContent(html, [
    /itemprop=["']image["'][^>]+(?:content|src)=["']([^"']+)["']/i,
    /(?:content|src)=["']([^"']+)["'][^>]+itemprop=["']image["']/i,
  ]));

  return pickBestImage(candidates);
}

// ── Main extraction: JSON-LD → Tavily fallback ────────────────────────────────

interface Extracted {
  content: string | null;
  imageUrl: string | null;
}

const NOTHING_EXTRACTED: Extracted = { content: null, imageUrl: null };

async function extractRecipeContent(url: string): Promise<Extracted> {
  const html = await fetchHtml(url);
  let imageUrl: string | null = null;
  if (html) {
    const schema = findRecipeSchema(extractJsonLdBlocks(html));
    imageUrl = extractHtmlImages(html, schema ?? null);
    if (schema) {
      const formatted = formatRecipeSchema(schema);
      if (formatted.length > 80) {
        return { content: formatted, imageUrl };
      }
    }
  }
  return { content: await tavilyExtractFallback(url), imageUrl };
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function enrichRecipes(
  slots: RecipeSlot[],
  onProgress?: (msg: string) => void
): Promise<EnrichedRecipe[]> {
  const total = slots.length;

  // Wave 1: find a recipe URL for every slot (a few at a time)
  let searched = 0;
  let failedSearches = 0;
  const searchStarted = Date.now();
  const urls = await mapWithLimit(slots, SEARCH_CONCURRENCY, async (slot) => {
    let url: string | null = null;
    try {
      url = await searchRecipeUrl(slot.recipeName, slot.sourceSite);
    } catch (err) {
      failedSearches++;
      console.warn(`Tavily search failed for "${slot.recipeName}":`, err instanceof Error ? err.message : err);
    }
    onProgress?.(`Searching recipes… (${++searched}/${total})`);
    return url;
  });
  timingLog('tavily search', searchStarted, ` (${urls.filter(Boolean).length}/${total} urls, ${failedSearches} failed)`);

  // One failed search is fine (that meal falls back to Gemini's own knowledge).
  // But if EVERY search failed, something is wrong with the key, the credits or
  // the rate limit: say so instead of quietly returning an AI-only plan.
  if (total > 0 && failedSearches === total) {
    throw new Error('Recipe search failed for every recipe. Check TAVILY_API_KEY and your Tavily credits.');
  }

  // Wave 2: download + extract each found page (a few at a time)
  onProgress?.('Retrieving recipe details…');
  let retrieved = 0;
  const extractStarted = Date.now();
  const extracted = await mapWithLimit(urls, EXTRACT_CONCURRENCY, async (url) => {
    const result = url
      ? await extractRecipeContent(url).catch(() => NOTHING_EXTRACTED)
      : NOTHING_EXTRACTED;
    onProgress?.(`Retrieving recipe details… (${++retrieved}/${total})`);
    return result;
  });
  timingLog('tavily extract', extractStarted);

  return slots.map((slot, i) => ({
    ...slot,
    sourceUrl: urls[i] ?? null,
    imageUrl: extracted[i]?.imageUrl ?? null,
    content: extracted[i]?.content ?? null,
  }));
}