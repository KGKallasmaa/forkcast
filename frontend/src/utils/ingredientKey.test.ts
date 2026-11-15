import { describe, it, expect } from 'vitest';
import { canonicalIngredientKey } from './ingredientKey';

describe('canonicalIngredientKey', () => {
  it('collapses chilli / chillies / chilly / chili to chili', () => {
    for (const name of ['chilli', 'chillies', 'chilly', 'chili']) {
      expect(canonicalIngredientKey(name)).toBe('chili');
    }
  });

  it('maps green chilli to green chili, and keeps it distinct from plain chili', () => {
    expect(canonicalIngredientKey('green chilli')).toBe('green chili');
    expect(canonicalIngredientKey('green chili')).toBe('green chili');
    expect(canonicalIngredientKey('green chilli')).not.toBe(canonicalIngredientKey('chili'));
  });

  it('collapses tomato / tomatoes', () => {
    expect(canonicalIngredientKey('tomatoes')).toBe(canonicalIngredientKey('tomato'));
  });

  it('collapses tomato puree / tomatoes puree (plural not at the end)', () => {
    expect(canonicalIngredientKey('tomatoes puree')).toBe(canonicalIngredientKey('tomato puree'));
  });

  it('is hyphen-insensitive for all-purpose flour', () => {
    expect(canonicalIngredientKey('all-purpose flour')).toBe(canonicalIngredientKey('all purpose flour'));
  });

  it('collapses aliases: scallion / green onion and cilantro / coriander', () => {
    expect(canonicalIngredientKey('scallion')).toBe(canonicalIngredientKey('green onion'));
    expect(canonicalIngredientKey('cilantro')).toBe(canonicalIngredientKey('coriander'));
  });

  it('drops quality qualifiers: extra virgin olive oil / olive oil', () => {
    expect(canonicalIngredientKey('extra virgin olive oil')).toBe(canonicalIngredientKey('olive oil'));
  });

  it('drops prep words: chopped onion / onion', () => {
    expect(canonicalIngredientKey('chopped onion')).toBe(canonicalIngredientKey('onion'));
  });

  it('does NOT collapse genuinely different ingredients: red chili vs green chili', () => {
    expect(canonicalIngredientKey('red chili')).not.toBe(canonicalIngredientKey('green chili'));
  });
});
