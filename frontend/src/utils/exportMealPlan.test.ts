import { describe, expect, it } from 'vitest';
import { escapeHtml, recipeCardHtml } from './exportMealPlan';
import type { Recipe } from '../types/mealPlan';

const payload = '<img src=x onerror="alert(1)">';

function recipeWith(text: string): Recipe {
  return {
    id: '1',
    name: text,
    cuisine: text,
    prepTime: 10,
    cookTime: 20,
    servings: 2,
    macros: {
      calories: 100,
      carbohydrates: 10,
      protein: 5,
      fats: 2,
      fiber: 1,
      sodium: 50,
      sugar: 3,
    },
    dietaryTags: [],
    equipment: [],
    ingredients: [{ name: text, quantity: 1, unit: 'cup', searchTerm: 'rice' }],
    steps: [text],
    notes: text,
    sourceSite: 'example.com',
    sourceUrl: null,
    imageUrl: null,
  };
}

describe('escapeHtml', () => {
  it('escapes the characters that can break out of HTML text', () => {
    expect(escapeHtml('<a href="x">&\'')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;');
  });

  it('leaves plain text unchanged', () => {
    expect(escapeHtml('Tomato rice, serves 2')).toBe('Tomato rice, serves 2');
  });
});

describe('recipeCardHtml', () => {
  it('does not output recipe text as raw HTML', () => {
    const html = recipeCardHtml(recipeWith(payload), 'lunch');
    expect(html).not.toContain(payload);
    expect(html).toContain('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
  });

  it('still renders a normal recipe', () => {
    const html = recipeCardHtml(recipeWith('Tomato Rice'), 'lunch');
    expect(html).toContain('Tomato Rice');
    expect(html).toContain('100 kcal');
  });
});
