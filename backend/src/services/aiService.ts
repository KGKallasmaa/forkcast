import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';
import { enrichRecipes, type RecipeSlot, type EnrichedRecipe } from './tavilyService.js';

// Fail fast with a clear message instead of an obscure error on the first request.
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) throw new Error('GEMINI_API_KEY is not set (see .env.example)');

const client = new GoogleGenAI({ apiKey });
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
// Used after the main model answers "overloaded" (HTTP 503). Pick a lighter model from AI Studio.
const GEMINI_FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.5-flash-lite';
// Base wait between retries; attempt n waits n x this. (Only lower it when testing.)
const RETRY_BASE_MS = Number(process.env.GEMINI_RETRY_MS) || 10_000;

export interface SlotToGenerate {
  day: string;
  date: string;
  mealType: string;
}

interface ExistingMeal {
  mealType: string;
  name: string;
  macros: { calories: number; carbohydrates: number; protein: number; fats: number; sugar: number };
}

interface DayContext {
  day: string;
  meals: ExistingMeal[];
}

export interface MealPlanRequest {
  cuisines: string[];
  equipment: string[];
  macros: { maxCalories: number; maxCarbs: number; maxFats: number; minFiber: number; minProtein: number };
  dietary: {
    maxSodium: number;
    allergens: string[];
    isVegetarian: boolean;
    isVegan: boolean;
    isHalal?: boolean;   // optional: the frontend doesn't send these (yet)
    isKosher?: boolean;
    maxSugar: number;
  };
  maxPrepTime: number;
  maxCookTime: number;
  mealsPerDay: number;
  leftovers: string;
  otherPreferences: string;
  blacklist: string[];
  startDate?: string;
  numDays?: number;
  pinnedRecipes?: { name: string; cuisineHint: string; mealType: string }[];
  slotsToGenerate?: SlotToGenerate[];
  existingDayMeals?: DayContext[];
  searchMode?: 'web' | 'training';
}

// What the generators return. The frontend builds the shopping list itself
// (it needs the pantry), so `shoppingList` is only here to satisfy its type.
interface DayMeal {
  mealType: string;
  recipe: Record<string, unknown>;
}

interface PlannedDay {
  day: string;
  date: string;
  meals: DayMeal[];
}

interface RegenMeal {
  day: string;
  date: string;
  mealType: string;
  recipe: Record<string, unknown>;
}

export interface MealPlanResult {
  weekOf: string;
  mealPlan: PlannedDay[];
  shoppingList: unknown[];
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function getMealTypes(mealsPerDay: number): string[] {
  const plans: Record<number, string[]> = {
    1: ['dinner'],
    2: ['breakfast', 'dinner'],
    3: ['breakfast', 'lunch', 'dinner'],
    4: ['breakfast', 'lunch', 'snack', 'dinner'],
    5: ['breakfast', 'morning snack', 'lunch', 'afternoon snack', 'dinner'],
    6: ['breakfast', 'morning snack', 'lunch', 'afternoon snack', 'dinner', 'evening snack'],
  };
  return plans[mealsPerDay] ?? ['breakfast', 'lunch', 'dinner'];
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Works in UTC throughout so the server's timezone can't shift a date by a day.
function getPlanDates(startDate?: string, numDays?: number) {
  const count = Math.min(Math.max(numDays ?? 7, 1), 7);
  const [y, m, d] = startDate ? startDate.split('-').map(Number) : [];
  const now = new Date();
  const start = new Date(Date.UTC(y ?? now.getFullYear(), (m ?? now.getMonth() + 1) - 1, d ?? now.getDate()));
  const days = Array.from({ length: count }, (_, i) => {
    const x = new Date(start);
    x.setUTCDate(x.getUTCDate() + i);
    return { day: DAY_NAMES[x.getUTCDay()] ?? 'Monday', date: x.toISOString().split('T')[0] ?? '' };
  });
  return { weekOf: days[0]?.date ?? '', days };
}

function preferenceSummary(req: MealPlanRequest): string {
  const dietaryFlags = [
    req.dietary.isVegan && 'Vegan',
    req.dietary.isVegetarian && !req.dietary.isVegan && 'Vegetarian',
    req.dietary.isHalal && 'Halal',
    req.dietary.isKosher && 'Kosher',
  ].filter(Boolean);

  return [
    `Cuisine: ${req.cuisines.length ? req.cuisines.join(', ') : 'Any'}`,
    `Equipment: ${req.equipment.length ? req.equipment.join(', ') : 'Standard kitchen'}`,
    `Daily calorie limit: ${req.macros.maxCalories} kcal`,
    `Daily protein: ≥${req.macros.minProtein}g | Daily carbs: ≤${req.macros.maxCarbs}g | Daily fat: ≤${req.macros.maxFats}g | Daily fiber: ≥${req.macros.minFiber}g`,
    `Daily sodium: ≤${req.dietary.maxSodium}mg | Daily sugar: ≤${req.dietary.maxSugar}g`,
    dietaryFlags.length ? `Diet: ${dietaryFlags.join(', ')}` : '',
    `Max prep time per recipe: ${req.maxPrepTime} min | Max cook time per recipe: ${req.maxCookTime} min`,
    req.leftovers ? `Ingredients to use up (include each in 1–2 recipes across the week, not in every meal): ${req.leftovers}` : '',
    req.otherPreferences ? `Other preferences: ${req.otherPreferences}` : '',
    req.blacklist.length ? `Do NOT use these recent recipes: ${req.blacklist.join(', ')}` : '',
  ].filter(Boolean).join('\n');
}

function parseJSON(text: string): unknown {
  let t = text.trim();

  // Strip markdown code fences
  if (t.startsWith('```')) {
    t = t.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
  }

  // If there's prose before the JSON, find the first structural character
  const firstBracket = t.indexOf('[');
  const firstBrace   = t.indexOf('{');
  const jsonStart =
    firstBracket === -1 ? firstBrace :
    firstBrace   === -1 ? firstBracket :
    Math.min(firstBracket, firstBrace);

  if (jsonStart > 0) t = t.slice(jsonStart);

  // Trim any trailing prose after the closing bracket/brace
  const lastBracket = t.lastIndexOf(']');
  const lastBrace   = t.lastIndexOf('}');
  const jsonEnd = Math.max(lastBracket, lastBrace);
  if (jsonEnd !== -1 && jsonEnd < t.length - 1) t = t.slice(0, jsonEnd + 1);

  try {
    return JSON.parse(t);
  } catch {
    throw new SyntaxError(`JSON parse failed. Raw response:\n\n${t}`);
  }
}

// Gemini answers 429 when you pass the free tier's rate limit and 503 when the
// model is overloaded. Both pass, so wait and retry. After a 503 we also switch
// to the fallback model, which is usually less busy.
const RETRYABLE = /\b(429|503)\b|RESOURCE_EXHAUSTED|UNAVAILABLE/;
const OVERLOADED = /\b503\b|UNAVAILABLE/;
const MAX_RETRIES = 3;

// The one place that talks to Gemini.
async function callGemini<T>(system: string, contents: string, maxOutputTokens: number): Promise<T> {
  let model = GEMINI_MODEL;
  for (let attempt = 0; ; attempt++) {
    let text: string | undefined;
    // Only the API call is inside the try, so the error text we test below is
    // always Gemini's own, never recipe text that happens to contain "429".
    try {
      const response = await client.models.generateContent({
        model,
        contents,
        config: { systemInstruction: system, maxOutputTokens, responseMimeType: 'application/json' },
      });
      text = response.text;
    } catch (err) {
      const message = String(err);
      if (!RETRYABLE.test(message) || attempt >= MAX_RETRIES) throw err;
      if (OVERLOADED.test(message)) model = GEMINI_FALLBACK_MODEL;
      await new Promise((resolve) => setTimeout(resolve, RETRY_BASE_MS * (attempt + 1)));
      continue;
    }
    if (!text) throw new Error('Empty response from Gemini');
    return parseJSON(text) as T;
  }
}

// ── Per-meal macro budget ─────────────────────────────────────────────────────

const MEAL_WEIGHTS: Record<string, number> = {
  breakfast: 3.0,
  'morning snack': 1.0,
  lunch: 3.5,
  snack: 1.5,
  'afternoon snack': 1.0,
  dinner: 4.0,
  'evening snack': 1.0,
};

function perMealTargetsSection(req: MealPlanRequest): string {
  if (req.existingDayMeals?.length) return '';

  const mealTypes = req.slotsToGenerate
    ? [...new Set(req.slotsToGenerate.map((s) => s.mealType))]
    : getMealTypes(req.mealsPerDay);

  const totalWeight = mealTypes.reduce((sum, mt) => sum + (MEAL_WEIGHTS[mt] ?? 2.0), 0);

  const lines = mealTypes.map((mt) => {
    const ratio = (MEAL_WEIGHTS[mt] ?? 2.0) / totalWeight;
    const cal     = Math.round(req.macros.maxCalories  * ratio);
    const protein = Math.round(req.macros.minProtein   * ratio);
    const carb    = Math.round(req.macros.maxCarbs     * ratio);
    const fat     = Math.round(req.macros.maxFats      * ratio);
    const sug     = Math.round(req.dietary.maxSugar    * ratio);
    return `  ${mt.padEnd(18)}: ≤${cal} kcal | ≥${protein}g protein | ≤${carb}g carbs | ≤${fat}g fat | ≤${sug}g sugar`;
  });

  return `\nPER-MEAL MACRO LIMITS (each individual recipe must stay within these):\n${lines.join('\n')}`;
}

// ── Allergen guard ────────────────────────────────────────────────────────────

const ALLERGEN_TRAPS: Record<string, string> = {
  Peanuts:      'NO Kung Pao Chicken, Pad Thai, Satay, Dan Dan Noodles, or any peanut sauce dish',
  'Tree Nuts':  'NO cashew chicken, walnut dishes, pine-nut dishes',
  Soy:          'NO tofu, edamame, soy sauce, teriyaki — nearly all Chinese/Asian recipes use soy sauce, so choose carefully',
  Shellfish:    'NO shrimp, crab, lobster, scallops, oysters, prawns',
  Fish:         'NO fish sauce (extremely common in Thai cooking), anchovy, fish fillets',
  Gluten:       'NO regular soy sauce (contains wheat), wheat noodles, dumpling/gyoza wrappers',
  Dairy:        'NO butter, cream, cheese, milk-based sauces',
  Eggs:         'NO fried rice with egg, egg drop soup, egg noodles, egg-based dishes',
};

function allergenGuardSection(allergens: string[]): string {
  if (!allergens.length) return '';

  const lines = allergens.map((a) => {
    const trap = ALLERGEN_TRAPS[a];
    return trap ? `  • ${a}: ${trap}` : `  • ${a}: avoid all dishes that commonly contain ${a.toLowerCase()}`;
  });

  return `\nALLERGEN CHECK — before finalising each recipe name, verify it does not contain:\n${lines.join('\n')}`;
}

// ── Day context for regen ─────────────────────────────────────────────────────

function dayContextSection(req: MealPlanRequest): string {
  if (!req.existingDayMeals?.length) return '';

  const blocks = req.existingDayMeals.map(({ day, meals }) => {
    const mealLines = meals.map((m) =>
      `    - ${m.mealType}: "${m.name}" → ${m.macros.calories} kcal | ${m.macros.protein}g protein | ${m.macros.sugar}g sugar | ${m.macros.fats}g fat | ${m.macros.carbohydrates}g carbs`
    ).join('\n');

    const usedCal     = meals.reduce((s, m) => s + m.macros.calories, 0);
    const usedProtein = meals.reduce((s, m) => s + m.macros.protein, 0);
    const usedSug     = meals.reduce((s, m) => s + m.macros.sugar, 0);
    const usedFat     = meals.reduce((s, m) => s + m.macros.fats, 0);
    const usedCarb    = meals.reduce((s, m) => s + m.macros.carbohydrates, 0);

    const remCal     = Math.max(0, req.macros.maxCalories - usedCal);
    const remProtein = Math.max(0, req.macros.minProtein  - usedProtein);
    const remSug     = Math.max(0, req.dietary.maxSugar   - usedSug);
    const remFat     = Math.max(0, req.macros.maxFats     - usedFat);
    const remCarb    = Math.max(0, req.macros.maxCarbs    - usedCarb);

    return [
      `  ${day} — meals already set:`,
      mealLines,
      `  Remaining daily budget for the new meal(s): ≤${remCal} kcal | ≥${remProtein}g protein still needed | ≤${remSug}g sugar | ≤${remFat}g fat | ≤${remCarb}g carbs`,
    ].join('\n');
  });

  return `\nDAY CONTEXT — the new recipe(s) must fit within the remaining daily budget below:\n${blocks.join('\n\n')}`;
}

// ── Shared prompts ────────────────────────────────────────────────────────────

const PLANNING_SYSTEM = `You are a meal planning assistant. Return ONLY a valid JSON array of meal slots — no prose, no markdown, just raw JSON starting with [ and ending with ].

Each object must have exactly these fields:
{
  "day": "Monday",
  "date": "YYYY-MM-DD",
  "mealType": "breakfast" | "lunch" | "dinner" | "snack" | "morning snack" | "afternoon snack" | "evening snack",
  "recipeName": "Exact Recipe Name",
  "cuisineHint": "Cuisine Type",
  "sourceSite": "bare domain of the most authoritative website for this specific recipe (no https:// and no path). For Indian dishes prefer vegrecipesofindia.com, hebbarskitchen.com, archanaskitchen.com or cookwithmanali.com. For other cuisines e.g. seriouseats.com, bbcgoodfood.com, allrecipes.com, foodnetwork.com, bonappetit.com"
}

Before finalising each recipe name:
1. Check it fits within the per-meal macro limits provided.
2. Check it respects the prep/cook time limits.
3. Check it does not contain any excluded allergens — reason through the ingredient list in your head.
4. Check it can be made with only the listed equipment.
5. If "Ingredients to use up" were specified, each such ingredient should appear in at most 1–2 recipes across the entire week — do not repeat them in every meal of the same type.
Only then add it to your output.`;

const RECIPE_SCHEMA = `{
  "id": "kebab-case-unique-id",
  "name": "Recipe Name",
  "cuisine": "Cuisine Type",
  "prepTime": 10,
  "cookTime": 20,
  "servings": 2,
  "macros": { "calories": 450, "carbohydrates": 52, "protein": 28, "fats": 14, "fiber": 6, "sodium": 820, "sugar": 8 },
  "dietaryTags": ["vegetarian"],
  "equipment": ["oven"],
  "ingredients": [{ "name": "...", "quantity": 1, "unit": "cup", "searchTerm": "what a shopper would type into an Indian grocery app, e.g. paneer, atta, curd, toor dal" }],
  "steps": ["Step 1.", "Step 2."],
  "notes": "Optional tip.",
  "sourceSite": "allrecipes.com"
}`;

const SYNTHESIS_RULES = `CRITICAL RULES:
1. Return ONLY raw valid JSON. No prose, no markdown, no code fences.
2. Use the real retrieved content for ingredients, steps, and notes. Do not contradict real content.
3. Set "sourceSite" to just the domain from the Source URL (e.g. "seriouseats.com"). If no URL was found, use the suggested site.
4. Estimate macros accurately from real ingredient quantities.
5. Strictly respect all dietary restrictions, allergen exclusions, per-meal macro limits (including minimum protein targets), and the remaining day budget where provided.
6. Never include any blacklisted recipe.`;

function buildRecipeBlocks(enriched: EnrichedRecipe[]): string {
  return enriched.map((r) => {
    const header = `=== ${r.day.toUpperCase()} — ${r.mealType.toUpperCase()}: ${r.recipeName} ===`;
    const urlLine = r.sourceUrl
      ? `Source URL: ${r.sourceUrl}`
      : `Source URL: not found — use ${r.sourceSite} as sourceSite`;
    const contentBlock = r.content
      ? `Content:\n${r.content}`
      : `[No web content retrieved — use training knowledge for this recipe]`;
    return `${header}\n${urlLine}\n${contentBlock}`;
  }).join('\n\n');
}

function buildPlanningMessage(req: MealPlanRequest): string {
  const { days } = getPlanDates(req.startDate, req.numDays);
  const slots = req.slotsToGenerate
    ? req.slotsToGenerate.map((s) => `${s.day} ${s.date} — ${s.mealType}`)
    : days.flatMap(({ day, date }) =>
        getMealTypes(req.mealsPerDay).map((mealType) => `${day} ${date} — ${mealType}`)
      );

  const pinnedSection = req.pinnedRecipes?.length
    ? `\nREQUIRED RECIPES TO INCLUDE (assign these to appropriate slots):\n${req.pinnedRecipes.map((p) => `- "${p.name}" (${p.cuisineHint}) as ${p.mealType}`).join('\n')}`
    : '';

  const dayCount = req.slotsToGenerate ? 'partial' : `${days.length}-day`;
  return `Plan a ${dayCount} meal schedule.

MEAL SLOTS TO FILL:
${slots.join('\n')}
${pinnedSection}

USER PREFERENCES:
${preferenceSummary(req)}
${perMealTargetsSection(req)}
${allergenGuardSection(req.dietary.allergens)}
${dayContextSection(req)}`;
}

// ── Web pipeline: plan → Tavily search → write one day at a time ──────────────

const DAY_SYNTHESIS_SYSTEM = `You are a professional chef and meal planner. You have been given real recipe content retrieved from cooking websites.

${SYNTHESIS_RULES}

Return a JSON ARRAY of meal objects for the day — one entry per meal slot:
[
  { "mealType": "breakfast", "recipe": ${RECIPE_SCHEMA} }
]`;

function buildDaySynthesisMessage(
  req: MealPlanRequest,
  day: { day: string; date: string },
  enriched: EnrichedRecipe[]
): string {
  return `Generate recipe JSON for ${day.day} (${day.date}).

USER PREFERENCES:
${preferenceSummary(req)}
${perMealTargetsSection(req)}
${allergenGuardSection(req.dietary.allergens)}

REAL RECIPE DATA RETRIEVED FROM THE WEB:
${buildRecipeBlocks(enriched)}`;
}

export async function generateMealPlan(
  req: MealPlanRequest,
  onProgress: (msg: string) => void = () => {}
): Promise<MealPlanResult> {
  if (req.searchMode === 'training') return generateMealPlanFromTraining(req, onProgress);

  // Phase 1 — Plan which recipes to use
  onProgress('Choosing recipes based on your preferences…');
  const slots = await callGemini<RecipeSlot[]>(PLANNING_SYSTEM, buildPlanningMessage(req), 3000);
  onProgress(`Selected ${slots.length} recipes — searching the web…`);

  // Phase 2 — Tavily search + extract for every recipe
  const enriched = await enrichRecipes(slots, onProgress);

  // Phase 3 — Write the days one after another. Sequential on purpose: parallel
  // calls would exceed the free tier's requests-per-minute limit.
  onProgress('Writing your meal plan…');
  const { weekOf, days } = getPlanDates(req.startDate, req.numDays);
  const mealPlan: PlannedDay[] = [];

  for (const d of days) {
    // Match on the date only: it's unambiguous, while the day-name text comes back from the model.
    const dayEnriched = enriched.filter((r: EnrichedRecipe) => r.date === d.date);
    const meals = await callGemini<DayMeal[]>(
      DAY_SYNTHESIS_SYSTEM,
      buildDaySynthesisMessage(req, d, dayEnriched),
      8000
    );
    mealPlan.push({
      day: d.day,
      date: d.date,
      meals: meals.map((meal) => {
        const src = dayEnriched.find((r: EnrichedRecipe) => r.mealType === meal.mealType);
        return {
          ...meal,
          recipe: { ...meal.recipe, sourceUrl: src?.sourceUrl ?? null, imageUrl: src?.imageUrl ?? null },
        };
      }),
    });
    onProgress(`Writing your meal plan… (${mealPlan.length}/${days.length})`);
  }

  return { weekOf, mealPlan, shoppingList: [] };
}

// ── Selective regeneration (web) ──────────────────────────────────────────────

const REGEN_SYNTHESIS_SYSTEM = `You are a professional chef and meal planner. You have been given real recipe content retrieved from cooking websites.

${SYNTHESIS_RULES}

Return a JSON ARRAY (not an object) matching EXACTLY this schema:
[
  {
    "day": "Monday",
    "date": "YYYY-MM-DD",
    "mealType": "breakfast",
    "recipe": ${RECIPE_SCHEMA}
  }
]`;

function buildRegenSynthesisMessage(req: MealPlanRequest, enriched: EnrichedRecipe[]): string {
  return `Generate replacement recipes for the specific meal slots listed below.

USER PREFERENCES:
${preferenceSummary(req)}
${allergenGuardSection(req.dietary.allergens)}
${dayContextSection(req)}

REAL RECIPE DATA RETRIEVED FROM THE WEB:
${buildRecipeBlocks(enriched)}`;
}

export async function regenerateMeals(
  req: MealPlanRequest,
  onProgress: (msg: string) => void = () => {}
): Promise<RegenMeal[]> {
  if (req.searchMode === 'training') return regenerateMealsFromTraining(req, onProgress);
  if (!req.slotsToGenerate?.length) throw new Error('No slots specified for regeneration');

  // Phase 1 — Plan only the specified slots
  onProgress('Choosing replacement recipes…');
  const slots = await callGemini<RecipeSlot[]>(PLANNING_SYSTEM, buildPlanningMessage(req), 2000);
  onProgress(`Selected ${slots.length} replacement recipe${slots.length === 1 ? '' : 's'} — searching the web…`);

  // Phase 2 — Tavily enrich those slots
  const enriched = await enrichRecipes(slots, onProgress);

  // Phase 3 — Write just the requested meals
  onProgress('Writing your updated meals…');
  const regenMeals = await callGemini<RegenMeal[]>(
    REGEN_SYNTHESIS_SYSTEM,
    buildRegenSynthesisMessage(req, enriched),
    8000
  );

  return regenMeals.map((m) => {
    const src = enriched.find((r: EnrichedRecipe) => r.day === m.day && r.mealType === m.mealType);
    return { ...m, recipe: { ...m.recipe, sourceUrl: src?.sourceUrl ?? null, imageUrl: src?.imageUrl ?? null } };
  });
}

// ── Training-only pipeline — Gemini writes recipes from its own knowledge ─────

const TRAINING_RULES = `CRITICAL RULES:
1. Return ONLY raw valid JSON. No prose, no markdown, no code fences.
2. Invent each recipe yourself from your own training knowledge — do not claim to have searched or retrieved anything from the web.
3. Set "sourceSite" to "Gemini" for every recipe.
4. Estimate macros accurately and consistently with the ingredient quantities you specify.
5. Strictly respect all dietary restrictions, allergen exclusions, per-meal macro limits (including minimum protein targets), and the remaining day budget where provided.
6. Never include any blacklisted recipe.`;

const TRAINING_DAY_SYSTEM = `You are a professional chef and meal planner. You do not have web access for this task — invent realistic, cookable recipes entirely from your own training knowledge.

${TRAINING_RULES}

Return a JSON ARRAY of meal objects for the day — one entry per meal slot:
[
  { "mealType": "breakfast", "recipe": ${RECIPE_SCHEMA} }
]`;

const TRAINING_REGEN_SYSTEM = `You are a professional chef and meal planner. You do not have web access for this task — invent realistic, cookable recipes entirely from your own training knowledge.

${TRAINING_RULES}

Return a JSON ARRAY (not an object) matching EXACTLY this schema:
[
  {
    "day": "Monday",
    "date": "YYYY-MM-DD",
    "mealType": "breakfast",
    "recipe": ${RECIPE_SCHEMA}
  }
]`;

type PinnedRecipe = { name: string; cuisineHint: string; mealType: string };

function assignPinnedToDays(
  pinnedRecipes: PinnedRecipe[] | undefined,
  days: { day: string; date: string }[]
): Map<string, PinnedRecipe[]> {
  const byDay = new Map<string, PinnedRecipe[]>();
  if (!pinnedRecipes?.length) return byDay;

  const usedDaysForType = new Map<string, Set<string>>();
  for (const pinned of pinnedRecipes) {
    const usedDays = usedDaysForType.get(pinned.mealType) ?? new Set<string>();
    const target = days.find((d) => !usedDays.has(d.day));
    if (!target) continue;
    usedDays.add(target.day);
    usedDaysForType.set(pinned.mealType, usedDays);
    byDay.set(target.day, [...(byDay.get(target.day) ?? []), pinned]);
  }
  return byDay;
}

function buildTrainingDayMessage(
  req: MealPlanRequest,
  day: { day: string; date: string },
  pinnedForDay: PinnedRecipe[]
): string {
  const mealTypes = getMealTypes(req.mealsPerDay);
  const pinnedSection = pinnedForDay.length
    ? `\nREQUIRED RECIPES TO INCLUDE (assign to the matching meal type; still write full original content for it):\n${pinnedForDay.map((p) => `- "${p.name}" (${p.cuisineHint}) as ${p.mealType}`).join('\n')}`
    : '';

  return `Generate a full day of meals for ${day.day} (${day.date}). Meal slots: ${mealTypes.join(', ')}.
${pinnedSection}

USER PREFERENCES:
${preferenceSummary(req)}
${perMealTargetsSection(req)}
${allergenGuardSection(req.dietary.allergens)}`;
}

function stampAiGenerated(recipe: Record<string, unknown>): Record<string, unknown> {
  return { ...recipe, sourceSite: 'Gemini', sourceUrl: null, imageUrl: null, aiGenerated: true };
}

export async function generateMealPlanFromTraining(
  req: MealPlanRequest,
  onProgress: (msg: string) => void = () => {}
): Promise<MealPlanResult> {
  onProgress('Generating recipes from training knowledge…');
  const { weekOf, days } = getPlanDates(req.startDate, req.numDays);
  const pinnedByDay = assignPinnedToDays(req.pinnedRecipes, days);
  const mealPlan: PlannedDay[] = [];

  // One day at a time to stay under the free tier's requests-per-minute limit.
  for (const d of days) {
    const meals = await callGemini<DayMeal[]>(
      TRAINING_DAY_SYSTEM,
      buildTrainingDayMessage(req, d, pinnedByDay.get(d.day) ?? []),
      8000
    );
    mealPlan.push({
      day: d.day,
      date: d.date,
      meals: meals.map((meal) => ({ ...meal, recipe: stampAiGenerated(meal.recipe) })),
    });
    onProgress(`Generating recipes… (${mealPlan.length}/${days.length})`);
  }

  return { weekOf, mealPlan, shoppingList: [] };
}

function buildTrainingRegenMessage(req: MealPlanRequest): string {
  const slots = req.slotsToGenerate ?? [];
  return `Generate replacement recipes for the specific meal slots listed below.

MEAL SLOTS TO FILL:
${slots.map((s) => `${s.day} ${s.date} — ${s.mealType}`).join('\n')}

USER PREFERENCES:
${preferenceSummary(req)}
${allergenGuardSection(req.dietary.allergens)}
${dayContextSection(req)}`;
}

export async function regenerateMealsFromTraining(
  req: MealPlanRequest,
  onProgress: (msg: string) => void = () => {}
): Promise<RegenMeal[]> {
  if (!req.slotsToGenerate?.length) throw new Error('No slots specified for regeneration');

  onProgress('Generating replacement recipes from training knowledge…');
  const regenMeals = await callGemini<RegenMeal[]>(TRAINING_REGEN_SYSTEM, buildTrainingRegenMessage(req), 8000);
  return regenMeals.map((m) => ({ ...m, recipe: stampAiGenerated(m.recipe) }));
}