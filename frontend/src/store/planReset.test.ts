import { describe, it, expect } from 'vitest';
import { isPlanStale, withoutRemovedItems, PLAN_TTL_MS } from './useMealPlanStore';
import type { ShoppingItem } from '../types/mealPlan';

describe('isPlanStale', () => {
  it('a fresh plan is not stale', () => {
    expect(isPlanStale(Date.now())).toBe(false);
  });

  it('a plan older than 24h is stale', () => {
    expect(isPlanStale(Date.now() - PLAN_TTL_MS - 1000)).toBe(true);
  });

  it('a plan just inside 24h is not stale', () => {
    expect(isPlanStale(Date.now() - PLAN_TTL_MS + 1000)).toBe(false);
  });

  it('a missing timestamp counts as stale', () => {
    expect(isPlanStale(null)).toBe(true);
    expect(isPlanStale(undefined)).toBe(true);
  });
});

describe('withoutRemovedItems', () => {
  const list: ShoppingItem[] = [
    { searchTerm: 'onion', displayName: 'Onion', estimatedQuantity: '2', usedIn: ['Soup'] },
    { searchTerm: 'garlic', displayName: 'Garlic', estimatedQuantity: '3 cloves', usedIn: ['Soup'] },
  ];

  it('removes by searchTerm', () => {
    expect(withoutRemovedItems(list, ['onion']).map((i) => i.searchTerm)).toEqual(['garlic']);
  });

  it('an empty removed list returns the list unchanged', () => {
    expect(withoutRemovedItems(list, [])).toBe(list);
  });

  it('unknown terms change nothing', () => {
    expect(withoutRemovedItems(list, ['nope']).length).toBe(2);
  });
});
