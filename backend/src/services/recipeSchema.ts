import { z } from 'zod';

// Zod schemas for what the LLM is asked to return. These mirror the
// RECIPE_SCHEMA text in aiService.ts and the frontend's types/mealPlan.ts,
// but for the LLM's shape only: the LLM recipe has NO sourceUrl, imageUrl
// or aiGenerated — the backend adds those after validation (source/image
// URLs from the web pipeline, the aiGenerated stamp from the training
// pipeline). callGemini validates every model response against these
// before it reaches a caller, so a malformed or absurd recipe fails the
// attempt and the model chain advances instead of bad data flowing
// into the plan and the shopping list.

// Bounds are deliberately generous: they catch absurd LLM output (a
// 999,999 kcal recipe, a negative quantity) without rejecting a
// legitimate large recipe. The per-meal macro limits in the prompt are
// the real constraint; these are a sanity net, not a diet plan.
export const LlmMacrosSchema = z.object({
  calories: z.number().min(0).max(5000),
  carbohydrates: z.number().min(0).max(1000),
  protein: z.number().min(0).max(500),
  fats: z.number().min(0).max(500),
  fiber: z.number().min(0).max(200),
  sodium: z.number().min(0).max(15000),
  sugar: z.number().min(0).max(500),
});
export type LlmMacros = z.infer<typeof LlmMacrosSchema>;

export const LlmIngredientSchema = z.object({
  name: z.string().min(1),
  quantity: z.number().min(0),
  unit: z.string(),
  searchTerm: z.string().min(1),
});
export type LlmIngredient = z.infer<typeof LlmIngredientSchema>;

export const LlmRecipeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  cuisine: z.string(),
  prepTime: z.number().int().min(0).max(1440),
  cookTime: z.number().int().min(0).max(1440),
  servings: z.number().int().positive().max(50),
  macros: LlmMacrosSchema,
  dietaryTags: z.array(z.string()),
  equipment: z.array(z.string()),
  ingredients: z.array(LlmIngredientSchema).min(1),
  steps: z.array(z.string().min(1)).min(1),
  notes: z.string(),
  sourceSite: z.string(),
});
export type LlmRecipe = z.infer<typeof LlmRecipeSchema>;

const DateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');

// One day's meals from the synthesis calls (web + training).
export const DayMealSchema = z.object({
  mealType: z.string().min(1),
  recipe: LlmRecipeSchema,
});
export type DayMeal = z.infer<typeof DayMealSchema>;

// One regenerated meal (web + training regen synthesis).
export const RegenMealSchema = z.object({
  day: z.string(),
  date: DateStringSchema,
  mealType: z.string().min(1),
  recipe: LlmRecipeSchema,
});
export type RegenMeal = z.infer<typeof RegenMealSchema>;

// One planned slot from the planning calls (web + regen planning).
// Mirrors the RecipeSlot interface in tavilyService.ts.
export const RecipeSlotSchema = z.object({
  day: z.string(),
  date: DateStringSchema,
  mealType: z.string().min(1),
  recipeName: z.string().min(1),
  cuisineHint: z.string(),
  sourceSite: z.string(),
});
export type RecipeSlot = z.infer<typeof RecipeSlotSchema>;
