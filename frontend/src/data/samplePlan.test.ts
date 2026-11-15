import { describe, expect, it } from 'vitest';
import { SAMPLE_DAYS } from './samplePlan';
import { DayPlanSchema } from '../types/mealPlan';
import { buildShoppingList } from '../store/useMealPlanStore';

describe('sample plan', () => {
  it('has 3 days with 3 meals each', () => {
    expect(SAMPLE_DAYS).toHaveLength(3);
    for (const day of SAMPLE_DAYS) {
      expect(day.meals).toHaveLength(3);
      expect(day.meals.map((m) => m.mealType)).toEqual(['breakfast', 'lunch', 'dinner']);
    }
  });

  it('every day and recipe passes the zod schema', () => {
    for (const day of SAMPLE_DAYS) {
      const parsed = DayPlanSchema.safeParse(day);
      expect(parsed.success).toBe(true);
    }
  });

  it('dates are the next 3 days, in order, with matching weekday names', () => {
    const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const now = new Date();
    SAMPLE_DAYS.forEach((day, i) => {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const date = String(d.getDate()).padStart(2, '0');
      expect(day.date).toBe(`${y}-${m}-${date}`);
      expect(day.day).toBe(DAY_NAMES[d.getDay()]);
    });
    const dates = SAMPLE_DAYS.map((d) => d.date);
    expect([...dates].sort()).toEqual(dates);
  });

  it('recipes are marked as samples, not AI output', () => {
    for (const day of SAMPLE_DAYS) {
      for (const meal of day.meals) {
        expect(meal.recipe.aiGenerated).toBe(false);
        expect(meal.recipe.sourceUrl).toBeNull();
        expect(meal.recipe.imageUrl).toBeNull();
        expect(meal.recipe.sourceSite.length).toBeGreaterThan(0);
      }
    }
  });

  it('builds a non-empty shopping list without throwing', () => {
    const list = buildShoppingList(SAMPLE_DAYS, []);
    expect(list.length).toBeGreaterThan(0);
    for (const item of list) {
      expect(item.searchTerm.length).toBeGreaterThan(0);
      expect(item.displayName.length).toBeGreaterThan(0);
      expect(item.usedIn.length).toBeGreaterThan(0);
    }
  });

  it('respects the pantry when building the shopping list', () => {
    const list = buildShoppingList(SAMPLE_DAYS, [
      { name: 'paneer', category: 'Proteins', addedAt: Date.now() },
    ]);
    // Paneer appears in two sample recipes; with it in the pantry it must
    // not appear as a to-buy item.
    expect(list.some((item) => item.searchTerm === 'paneer')).toBe(false);
  });
});
